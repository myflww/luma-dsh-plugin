import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Paperclip } from 'lucide-react'
import { checkAttachmentBatch, FILE_ACCEPT, inspectChatFile, type AttachmentInfo } from '../shared/chat-attachments.ts'
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

export function ComposerActions({ files, native, nativeUploads = false, disabled, change, error, children }: {
  files: readonly File[]; native: boolean; nativeUploads?: boolean | undefined; disabled: boolean; change(files: File[]): void; error(message: string): void; children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const help = nativeUploads ? '图片随消息发送，其他文件可由 DSH 工具读取。' :
    '支持 PNG、JPEG、WEBP、GIF、UTF-8 文本' + (native ? '。' : '及 PDF，图片与 PDF 需要模型支持。')
  useEffect(() => {
    if (!open) return
    actions.current?.querySelector<HTMLButtonElement>('button:enabled')?.focus()
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  function close() {
    setOpen(false)
    trigger.current?.focus()
  }
  return <div className="lumaComposerActions" ref={container} onKeyDown={event => {
    if (open && event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close() }
  }} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button ref={trigger} type="button" className="lumaContactAdd" aria-label="更多聊天操作" aria-expanded={open}
      aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>＋</button>
    <input type="file" ref={input} hidden multiple accept={nativeUploads ? undefined : native ? FILE_ACCEPT.replace('.pdf,', '') : FILE_ACCEPT}
      aria-label="选择图片或文件" disabled={disabled} onChange={e => {
        const next = [...files, ...Array.from(e.currentTarget.files ?? [])]
        e.currentTarget.value = ''
        try { checkAttachmentBatch(next.map(file => inspectChatFile(file, native, nativeUploads))); change(next); error('') }
        catch (reason) { error(reason instanceof Error ? reason.message : '附件读取失败。') }
      }}/>
    {open && <div ref={actions} id={menuId} className="lumaComposerActionList" role="group" aria-label="聊天操作"
      onClick={event => { if (event.target instanceof Element && event.target.closest('button')) close() }}>
      <button type="button" title={help} disabled={disabled} onClick={() => input.current?.click()}><Paperclip size={15} aria-hidden="true" />添加图片或文件</button>
      {children}
    </div>}
  </div>
}

export function PendingAttachments({ files, disabled, change }: { files: readonly File[]; disabled: boolean; change(files: File[]): void }) {
  if (!files.length) return null
  return <ul className="lumaAttachmentChips" aria-label="待发送附件">{files.map((file, index) =>
      <li key={index}>{(/\.(?:png|jpe?g|gif|webp)$/i.test(file.name) || /^image\/(?:png|jpeg|gif|webp)$/.test(file.type))
        && <PendingImage file={file} />}<span>{file.name}</span><small>{Math.ceil(file.size / 1024)} KiB</small>
        <button type="button" disabled={disabled} aria-label={'移除 ' + file.name} onClick={() => change(files.filter((_, i) => i !== index))}>×</button></li>)}</ul>
}

export function useAttachmentDrafts() {
  const [drafts, setDrafts] = useState<Record<string, File[]>>({})
  return { filesFor: (key: string) => drafts[key] ?? [], change: (key: string, files: File[]) =>
    setDrafts(current => { const next = { ...current }; if (files.length) next[key] = files; else delete next[key]; return next }) }
}
