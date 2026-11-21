import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/** Room art and its actors share one untransformed coordinate system in either view. */
export function SceneViewport({ ratio, fit, focusX = .5, focusY = .5, children }: {
  ratio: number; fit: boolean; focusX?: number; focusY?: number; children: ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id:number; x:number; y:number; left:number; top:number } | undefined>(undefined)
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element || !frame.current) return
    const center = () => {
      element.scrollLeft = element.scrollWidth * focusX - element.clientWidth / 2
      element.scrollTop = element.scrollHeight * focusY - element.clientHeight / 2
    }
    center()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(center)
    observer.observe(element)
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [fit, ratio, focusX, focusY])

  return <div className="lumaSceneViewport" ref={viewport} tabIndex={0} role="region" aria-label={fit ? '场景全景' : '场景画面，可用方向键平移'}
    data-view={fit ? 'fit' : 'fill'} style={{ '--scene-ratio':ratio } as CSSProperties}
    onKeyDown={event => {
      const el = event.currentTarget
      if (fit || event.target !== el) return
      const direction: Record<string, readonly [number, number]> = {
        ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1],
      }
      const delta = direction[event.key]
      if (!delta) return
      event.preventDefault()
      el.scrollLeft += delta[0] * Math.max(48, el.clientWidth / 5)
      el.scrollTop += delta[1] * Math.max(48, el.clientHeight / 5)
    }}
    onPointerDown={event => {
      const el=event.currentTarget
      if (fit || event.button !== 0 || !event.isPrimary || event.target instanceof Element && event.target.closest('button,input,select,a,summary')) return
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return
      drag.current = {id:event.pointerId,x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop}
      el.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      const current=drag.current
      if (!current || current.id !== event.pointerId) return
      event.currentTarget.scrollLeft = current.left + current.x - event.clientX
      event.currentTarget.scrollTop = current.top + current.y - event.clientY
    }}
    onLostPointerCapture={() => { drag.current=undefined }}
    onPointerUp={() => { drag.current=undefined }}
    onPointerCancel={() => { drag.current=undefined }}>
    <div ref={frame} className="lumaSceneArtFrame">{children}</div>
  </div>
}
