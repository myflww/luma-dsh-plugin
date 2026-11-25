import { useLayoutEffect, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import type { OfficePresentationResult } from './OfficePresentationStore.ts'
import './OfficeName.css'

interface OfficeNameProps {
  name: string
  defaultName: string
  canEdit: boolean
  save: (name: string) => Promise<OfficePresentationResult>
}

export function OfficeName({ name, defaultName, canEdit, save }: OfficeNameProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const isEditing = draft !== null
  useLayoutEffect(() => {
    if (isEditing) {
      input.current?.focus()
      input.current?.select()
    } else if (restoreFocus.current) {
      restoreFocus.current = false
      trigger.current?.focus()
    }
  }, [isEditing])

  function close() {
    restoreFocus.current = true
    setDraft(null)
    setError('')
  }
  async function apply() {
    if (draft === null || saving || !canEdit) return
    setSaving(true)
    try {
      const result = await save(draft.trim() === defaultName ? '' : draft)
      if (result.status === 'rejected') setError(result.message)
      else close()
    } catch {
      setError('名称未保存，请重试。')
    } finally {
      setSaving(false)
    }
  }
  if (draft === null) return <h1 className="lumaOfficeName" aria-label={name}>
    <button ref={trigger} type="button" disabled={!canEdit} className="lumaOfficeNameTrigger" title={name + ' · 编辑办公室名称'}
      aria-label={'编辑办公室名称，' + name} onClick={() => setDraft(name)}>
      <span>{name}</span><Pencil size={13} aria-hidden="true"/>
    </button>
  </h1>
  return <div className="lumaOfficeNameEdit">
    <div className="lumaOfficeNameControls">
      <input type="text" ref={input} aria-label="办公室名称" value={draft} placeholder={defaultName} readOnly={saving}
        onChange={event => { setDraft(event.target.value); setError('') }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
          if (event.key === 'Enter') { event.preventDefault(); void apply() }
          else if (event.key === 'Escape' && !saving) { event.preventDefault(); event.stopPropagation(); close() }
        }}/>
      <button type="button" aria-label="保存办公室名称" title="保存" disabled={saving || !canEdit} onClick={() => void apply()}><Check size={16}/></button>
      <button type="button" aria-label="取消改名" title="取消" disabled={saving} onClick={close}><X size={15}/></button>
    </div>
    {error && <small role="alert">{error}</small>}
  </div>
}
