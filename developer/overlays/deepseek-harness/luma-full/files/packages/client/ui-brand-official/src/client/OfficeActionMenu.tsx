import { useEffect, useRef, useState } from 'react'
import { officeManualActionChoices, type OfficeManualActionId, type OfficeManualPlayback } from './office2d/manualActions.ts'
import './OfficeActionMenu.css'

export interface OfficeActionMenuTarget { readonly employeeId: string; readonly name: string; readonly x: number; readonly y: number }
export function OfficeActionMenu({ target, skinId, onAction, onRestore, onClose }: Readonly<{
  skinId?: string | undefined
  target: OfficeActionMenuTarget
  onAction: (id: OfficeManualActionId, mode: OfficeManualPlayback) => void
  onRestore: () => void
  onClose: () => void
}>) {
  const menu = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<OfficeManualPlayback>('once')
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])
  const x = Math.max(8, Math.min(target.x, window.innerWidth - 252))
  const y = Math.max(8, Math.min(target.y, window.innerHeight - 326))
  return <div className="lumaOfficeActionBackdrop" onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}
    onContextMenu={event => event.preventDefault()}>
    <div ref={menu} className="lumaOfficeActionMenu" role="dialog" aria-label={`${target.name}的动作清单`}
      style={{ left: x, top: y }} onPointerDown={event => event.stopPropagation()}>
      <strong>{target.name} · 动作</strong>
      <div role="group" aria-label="播放方式" className="lumaOfficeActionPlayback">
        {(['once', 'loop', 'hold'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value}
          onClick={() => setMode(value)}>{value === 'once' ? '一次' : value === 'loop' ? '循环' : '保持'}</button>)}
      </div>
      {officeManualActionChoices(target.employeeId, skinId).map(action => <button key={action.id} type="button"
        onClick={() => onAction(action.id, mode)}>{action.label}</button>)}
      <button type="button" className="lumaOfficeActionRestore" onClick={onRestore}>恢复自动行为</button>
      <button type="button" onClick={onClose}>关闭</button>
    </div>
  </div>
}
