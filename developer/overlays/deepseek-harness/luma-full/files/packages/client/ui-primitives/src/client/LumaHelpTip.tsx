import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './LumaHelpTip.css'

export interface LumaHelpTipProps {
  readonly label: string
  readonly content: ReactNode
  readonly descriptionId?: string
}

/** Compact, optional explanations stay reachable by mouse, keyboard and touch. */
export function LumaHelpTip({ label, content, descriptionId }: LumaHelpTipProps) {
  const generatedId = useId()
  const description = descriptionId ?? `${generatedId}-description`
  const tooltipId = `${generatedId}-tooltip`
  const trigger = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const hover = useRef({ trigger: false, bubble: false })
  const focused = useRef(false)
  const pinned = useRef(false)
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number; side: 'top' | 'bottom' } | null>(null)
  const cancelTimers = () => { clearTimeout(showTimer.current); clearTimeout(hideTimer.current) }
  const dismiss = () => { cancelTimers(); pinned.current = false; setOpen(false); setPosition(null) }
  const enter = (target: 'trigger' | 'bubble') => {
    hover.current[target] = true
    clearTimeout(hideTimer.current)
    if (target === 'trigger' && !open) {
      clearTimeout(showTimer.current)
      showTimer.current = setTimeout(() => { if (hover.current.trigger) setOpen(true) }, 350)
    }
  }
  const leave = (target: 'trigger' | 'bubble') => {
    hover.current[target] = false
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
    // The short grace period bridges the gap between the button and its bubble.
    hideTimer.current = setTimeout(() => {
      if (!hover.current.trigger && !hover.current.bubble && !focused.current && !pinned.current) dismiss()
    }, 120)
  }
  useEffect(() => () => { cancelTimers() }, [])
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const button = trigger.current, tip = bubble.current
      if (!button || !tip) return
      const anchor = button.getBoundingClientRect(), rect = tip.getBoundingClientRect()
      const margin = 12, gap = 8
      const width = rect.width, height = rect.height
      const side = anchor.bottom + gap + height > window.innerHeight - margin && anchor.top - gap - height >= margin ? 'top' : 'bottom'
      setPosition({
        left: Math.max(margin, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - margin - width)),
        top: Math.max(margin, Math.min(side === 'top' ? anchor.top - gap - height : anchor.bottom + gap, window.innerHeight - margin - height)),
        side,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (trigger.current) observer?.observe(trigger.current)
    if (bubble.current) observer?.observe(bubble.current)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); observer?.disconnect() }
  }, [open, content])
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
      // Window capture precedes the dialog manager's document capture listener.
      event.preventDefault(); event.stopPropagation(); dismiss()
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && (trigger.current?.contains(event.target) || bubble.current?.contains(event.target))) return
      dismiss()
    }
    window.addEventListener('keydown', escape, true)
    document.addEventListener('pointerdown', outside, true)
    return () => { window.removeEventListener('keydown', escape, true); document.removeEventListener('pointerdown', outside, true) }
  }, [open])

  // Body siblings are inert while LumaModal is open. Mount within that modal's
  // top-level portal to escape its scroll container without defeating isolation.
  let portal: HTMLElement | null = typeof document === 'undefined' ? null : document.body
  const dialog = trigger.current?.closest<HTMLElement>('[role="dialog"], [aria-modal="true"]')
  if (dialog) {
    portal = dialog
    while (portal.parentElement && portal.parentElement !== document.body) portal = portal.parentElement
  }
  return <span className="lumaHelpTip">
    <button ref={trigger} className="lumaHelpTrigger" type="button" aria-label={label} aria-describedby={description}
      aria-expanded={open} aria-controls={open ? tooltipId : undefined}
      onMouseEnter={() => enter('trigger')} onMouseLeave={() => leave('trigger')}
      onFocus={() => { focused.current = true; cancelTimers(); setOpen(true) }}
      onBlur={() => { focused.current = false; leave('trigger') }}
      onClick={() => { if (pinned.current) dismiss(); else { cancelTimers(); pinned.current = true; setOpen(true) } }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
    </button>
    <span id={description} className="lumaHelpDescription">{content}</span>
    {open && portal && createPortal(<span id={tooltipId} ref={bubble} className="lumaHelpBubble" role="tooltip"
      data-side={position?.side ?? 'bottom'} style={{ left: position?.left ?? 12, top: position?.top ?? 12, visibility: position ? 'visible' : 'hidden' }}
      onMouseEnter={() => enter('bubble')} onMouseLeave={() => leave('bubble')}>{content}</span>, portal)}
  </span>
}
