import { useEffect, useId, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import './ContactTitle.css'

interface ContactTitleProps {
  title: string
  value: string
  defaultName?: string
  editable: boolean
  save(value: string, previous: string): Promise<void>
}

export function ContactTitle({title, value, defaultName, editable, save}: ContactTitleProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const original = useRef(value)
  const trigger = useRef<HTMLButtonElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const id = useId()
  const open = draft !== null
  const label = defaultName ? '联系人备注' : '群聊名称'
  useEffect(() => {
    if (!open) return
    field.current?.focus()
    field.current?.select()
  }, [open])
  useEffect(() => {
    if (!open || busy) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !form.current?.contains(event.target) && !trigger.current?.contains(event.target)) setDraft(null)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open, busy])
  function close() {
    setDraft(null)
    trigger.current?.focus()
  }
  async function submit() {
    if (!editable || busy || draft === null) return
    setBusy(true); setError('')
    try {
      await save(draft.trim(), original.current)
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '未能保存，请重试。')
    } finally { setBusy(false) }
  }
  return <>
    <h2 aria-label={title}>{editable ? <button ref={trigger} type="button" className="lumaContactTitleButton"
      aria-label={'编辑'+label} title={'编辑'+label} aria-expanded={open} aria-controls={open?id:undefined}
      onClick={() => { if (open) { if (!busy) close(); return }; original.current=value;setError('');setDraft(value) }}>
      <span>{title}</span><Pencil size={13} aria-hidden="true"/>
    </button> : title}</h2>
    {open && <form ref={form} id={id} className="lumaContactTitleEditor" aria-label={'编辑'+label}
      onKeyDown={e=>{if(e.key==='Escape' && !e.nativeEvent.isComposing && !busy){e.stopPropagation();e.preventDefault();close()}}}
      onSubmit={e=>{e.preventDefault();void submit()}}>
      <label htmlFor={id+'-name'}>{label}</label>
      {defaultName && <small>原名 · {defaultName}</small>}
      <input ref={field} id={id+'-name'} value={draft} maxLength={60} readOnly={busy} autoComplete="off"
        placeholder={defaultName || undefined} onChange={e=>{setError('');setDraft(e.target.value)}}
        onKeyDown={e=>{if(e.key==='Enter' && (e.nativeEvent.isComposing || e.nativeEvent.keyCode===229))e.preventDefault()}}/>
      {error && <small role="alert">{error}</small>}
      <div><button type="button" aria-label={'取消编辑'+label} disabled={busy} onClick={close}><X size={14}/>取消</button>
        <button type="submit" className="is-primary" aria-label={'保存'+label} disabled={busy || !editable || (!defaultName && !draft.trim())}><Check size={14}/>保存</button></div>
    </form>}
  </>
}
