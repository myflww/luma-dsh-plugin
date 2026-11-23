import { checkAttachmentBatch, decodeAttachmentText, inspectChatFile, type AttachmentInfo, type ChatAttachment } from '../shared/chat-attachments.ts'

export interface SessionFile extends AttachmentInfo { file: File; inlineText?: string }

function encodeFile(file: File, info: AttachmentInfo): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reader.onabort = () => reject(Error(file.name + '：无法读取文件，请重新选择。'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve({ ...info, data: result.slice(result.indexOf(',') + 1) })
    }
    reader.readAsDataURL(file)
  })
}

export async function readChatFiles(files: readonly File[], dsh: boolean): Promise<ChatAttachment[]> {
  const infos = files.map(file => inspectChatFile(file, dsh))
  checkAttachmentBatch(infos)
  const attachments: ChatAttachment[] = []
  for (const [index, file] of files.entries()) attachments.push(await encodeFile(file, infos[index]!))
  return attachments
}

export async function readSessionFiles(files: readonly File[]): Promise<(ChatAttachment | SessionFile)[]> {
  const infos = files.map(file => inspectChatFile(file, true, true))
  checkAttachmentBatch(infos)
  const attachments: (ChatAttachment | SessionFile)[] = []
  for (const [index, file] of files.entries()) {
    const info = infos[index]!
    if (info.mediaType.startsWith('image/')) {
      attachments.push(await encodeFile(file, info))
      continue
    }
    // DSH uploads the original File. Only small text gets an additional in-prompt preview.
    const original: SessionFile = { ...info, file }
    if (info.mediaType === 'text/plain' && file.size <= 64 * 1024) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      try { original.inlineText = decodeAttachmentText(file.name, bytes) }
      catch { original.mediaType = 'application/octet-stream' }
    } else if (info.mediaType === 'application/pdf' && await file.slice(0, 5).text() !== '%PDF-') {
      throw Error(file.name + '：文件内容与所选格式不符。')
    }
    attachments.push(original)
  }
  return attachments
}
