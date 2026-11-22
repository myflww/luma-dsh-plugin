import { useEffect, useRef, useState } from 'react'
import { attachmentInfo, checkAttachmentBatch, FILE_ACCEPT, inspectChatFile, validateChatAttachments, type AttachmentInfo, type ChatAttachment } from '../shared/chat-attachments.ts'
import './ChatAttachments.css'

export function AttachmentNames({ items }: { items?: readonly AttachmentInfo[] | undefined }) {
  if (!items?.length) return null
  return <ul className="lumaAttachmentChips" aria-label="已发送附件">{items.map((item, index) =>
    <li key={index}><span>{item.name}</span><small>{Math.ceil(item.bytes / 1024)} KiB</small></li>)}</ul>
}

function PendingImage({ file }: { file: File }) {
  const preview = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!preview.current || typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(file)
    preview.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <img ref={preview} className="lumaAttachmentThumbnail" alt={file.name + ' 缩略图'} />
}

export function AttachmentPicker({ files, native, nativeUploads = false, disabled, change, error }: {
  files: readonly File[]; native: boolean; nativeUploads?: boolean | undefined; disabled: boolean; change(files: File[]): void; error(message: string): void
}) {
  const input = useRef<HTMLInputElement>(null)
  const help = '最多 4 个，单个 4 MiB，合计 6 MiB。' + (nativeUploads ? '图片随消息发送，其他文件可由 DSH 工具读取。' :
    'UTF-8 文本单个 64 KiB。支持 PNG、JPEG、WEBP、GIF、文本' + (native ? '。' : '及 PDF，图片与 PDF 需要模型支持。'))
  return <section className="lumaAttachmentPicker" aria-label="消息附件">
    <input type="file" ref={input} hidden multiple accept={nativeUploads ? undefined : native ? FILE_ACCEPT.replace('.pdf,', '') : FILE_ACCEPT}
      aria-label="选择图片或文件" disabled={disabled} onChange={e => {
        const next = [...files, ...Array.from(e.currentTarget.files ?? [])]
        e.currentTarget.value = ''
        try { checkAttachmentBatch(next.map(file => inspectChatFile(file, native, nativeUploads))); change(next); error('') }
        catch (reason) { error(reason instanceof Error ? reason.message : '附件读取失败。') }
      }}/>
    <button type="button" title={help} disabled={disabled} onClick={() => input.current?.click()}>添加图片或文件</button>
    {!!files.length && <ul className="lumaAttachmentChips" aria-label="待发送附件">{files.map((file, index) =>
      <li key={index}>{(/\.(?:png|jpe?g|gif|webp)$/i.test(file.name) || /^image\/(?:png|jpeg|gif|webp)$/.test(file.type))
        && <PendingImage file={file} />}<span>{file.name}</span><small>{Math.ceil(file.size / 1024)} KiB</small>
        <button type="button" disabled={disabled} aria-label={'移除 ' + file.name} onClick={() => { change(files.filter((_, i) => i !== index)); error('') }}>×</button></li>)}</ul>}
  </section>
}

export function useAttachmentDrafts() {
  const [drafts, setDrafts] = useState<Record<string, File[]>>({})
  return { filesFor: (key: string) => drafts[key] ?? [], change: (key: string, files: File[]) =>
    setDrafts(current => { const next = { ...current }; if (files.length) next[key] = files; else delete next[key]; return next }) }
}

export async function readChatFiles(files: readonly File[], native: boolean, nativeUploads = false): Promise<ChatAttachment[]> {
  const infos = files.map(file => inspectChatFile(file, native, nativeUploads))
  checkAttachmentBatch(infos)
  const items = await Promise.all(files.map((file, index) => new Promise<ChatAttachment>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reader.onabort = () => reject(Error(file.name + '：无法读取文件，请重新选择。'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve({ ...attachmentInfo(infos[index]!), data: result.slice(result.indexOf(',') + 1) })
    }
    reader.readAsDataURL(file)
  })))
  return validateChatAttachments(items, nativeUploads)
}
