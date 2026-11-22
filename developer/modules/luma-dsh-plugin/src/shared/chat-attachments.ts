export const MAX_CHAT_ATTACHMENTS = 4
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
export const MAX_CHAT_ATTACHMENT_BYTES = 6 * 1024 * 1024
export const MAX_TEXT_ATTACHMENT_BYTES = 64 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export type ImageType = typeof IMAGE_TYPES[number]
export type AttachmentType = ImageType | 'text/plain' | 'application/pdf' | 'application/octet-stream'
export interface AttachmentInfo { name: string; mediaType: AttachmentType; bytes: number }
export interface ChatAttachment extends AttachmentInfo { data: string }
const formats: Record<string, AttachmentType> = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', pdf:'application/pdf' }
const textExtensions = 'txt md markdown csv tsv json jsonl yaml yml toml xml html htm css js jsx ts tsx py rs cpp c h java sql log srt ini sh ps1'.split(' ')
export const FILE_ACCEPT = [...Object.keys(formats), ...textExtensions].map(extension => '.' + extension).join(',') + ',text/*'
export const attachmentInfo = ({ name, mediaType, bytes }: AttachmentInfo): AttachmentInfo => ({ name, mediaType, bytes })

export function inspectChatFile(file: Pick<File, 'name' | 'type' | 'size'>, native: boolean, nativeUploads = false): AttachmentInfo {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  const text = textExtensions.includes(extension) || file.type.startsWith('text/')
  let mediaType: AttachmentType | undefined = Object.hasOwn(formats, extension) ? formats[extension] : undefined
  if (!mediaType) {
    if (IMAGE_TYPES.includes(file.type as ImageType) || file.type === 'application/pdf') mediaType = file.type as AttachmentType
    else if (text && (!nativeUploads || file.size <= MAX_TEXT_ATTACHMENT_BYTES)) mediaType = 'text/plain'
    else if (native && nativeUploads) mediaType = 'application/octet-stream'
  }
  if (!mediaType) throw Error(file.name + '：不支持此格式。请选择图片、UTF-8 文本或独立 API 支持的 PDF。')
  if (native && !nativeUploads && mediaType === 'application/pdf') throw Error('当前 DSH 模型通道接收图片与文本。发送 PDF 请选用支持 PDF 的自定义服务，或打开支持文件上传的原生 DSH 会话。')
  const info = { name: file.name, bytes: file.size, mediaType }
  checkInfo(info)
  return info
}
function checkInfo(info: AttachmentInfo) {
  if (typeof info.name !== 'string' || !info.name.trim() || info.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(info.name)) throw Error('附件名称无效。')
  if (![...IMAGE_TYPES, 'text/plain', 'application/pdf', 'application/octet-stream'].includes(info.mediaType)) throw Error('附件格式不受支持。')
  if (!Number.isSafeInteger(info.bytes) || info.bytes <= 0) throw Error(info.name + '：文件为空或大小无效。')
  if (info.bytes > MAX_ATTACHMENT_BYTES) throw Error(info.name + '：单个附件上限为 4 MiB。')
  if (info.mediaType === 'text/plain' && info.bytes > MAX_TEXT_ATTACHMENT_BYTES) throw Error(info.name + '：文本附件上限为 64 KiB。')
}
export function checkAttachmentBatch(items: readonly AttachmentInfo[]) {
  if (items.length > MAX_CHAT_ATTACHMENTS) throw Error('每条消息最多可添加 4 个附件。')
  if (items.reduce((total, item) => total + item.bytes, 0) > MAX_CHAT_ATTACHMENT_BYTES) throw Error('每条消息的附件合计上限为 6 MiB。')
}
export function attachmentBytes(item: ChatAttachment): Uint8Array<ArrayBuffer> {
  const binary = atob(item.data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
export function attachmentText(item: ChatAttachment) {
  const bytes = attachmentBytes(item)
  try {
    const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes)
    if (/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text)) throw Error()
    return text
  } catch { throw Error(item.name + '：请使用 UTF-8 编码的文本文件。') }
}
export function textFileBlock(item: ChatAttachment) { return '附件「' + item.name + '」\n' + attachmentText(item) }
export function validateChatAttachments(input: unknown, nativeUploads = false): ChatAttachment[] {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_CHAT_ATTACHMENTS) throw Error('每条消息最多可添加 4 个附件。')
  const items = input.map(raw => {
    if (!raw || typeof raw !== 'object') throw Error('附件无效。')
    const {name, mediaType, bytes, data} = raw
    const item = {name, mediaType, bytes, data}
    checkInfo(item)
    if (!nativeUploads && mediaType === 'application/octet-stream') throw Error(name + '：独立 API 支持图片、UTF-8 文本和 PDF。其他格式可在 DSH 桌面会话中上传。')
    if (typeof data !== 'string' || data.length !== Math.ceil(bytes / 3) * 4 || /[^A-Za-z0-9+/=]/.test(data)) throw Error(name + '：附件数据不完整。')
    return item as ChatAttachment
  })
  checkAttachmentBatch(items)
  for (const item of items) {
    let binary: string
    try { binary = atob(item.data) } catch { throw Error(item.name + '：附件编码无效。') }
    if (binary.length !== item.bytes) throw Error(item.name + '：附件大小不一致。')
    if (btoa(binary) !== item.data) throw Error(item.name + '：附件编码无效。')
    if (item.mediaType === 'application/octet-stream') continue
    if (item.mediaType === 'text/plain') {
      try { attachmentText(item) }
      catch (error) {
        if (!nativeUploads) throw error
        item.mediaType = 'application/octet-stream'
      }
      continue
    }
    const valid = item.mediaType === 'image/png' ? binary.startsWith('\x89PNG\r\n\x1a\n')
      : item.mediaType === 'image/jpeg' ? binary.startsWith('\xff\xd8\xff')
      : item.mediaType === 'image/gif' ? /^GIF8[79]a/.test(binary)
      : item.mediaType === 'image/webp' ? binary.startsWith('RIFF') && binary.slice(8,12) === 'WEBP'
      : binary.startsWith('%PDF-')
    if (!valid) throw Error(item.name + '：文件内容与所选格式不符。')
  }
  return items
}
