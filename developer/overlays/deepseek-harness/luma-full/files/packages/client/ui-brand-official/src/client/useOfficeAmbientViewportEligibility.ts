import { useLayoutEffect, useRef } from 'react';
import { cancelSceneFrame, requestSceneFrame } from './officeSceneFrame.ts';
import type { OfficeSceneSurfaceProps } from './OfficeSceneSurface.types.ts';
type OfficeViewportRect = Readonly<{ left: number; top: number; right: number; bottom: number }>

/** CSS viewport coordinates already include every ancestor transform. Require
 * the complete actor hit target, not just a sliver or the overlay's zero-size
 * anchor, so a clipped/offscreen colleague cannot speak from the screen edge. */
export function isOfficeAmbientActorInViewport(actor: OfficeViewportRect, viewport: OfficeViewportRect): boolean {
  return [actor.left, actor.top, actor.right, actor.bottom, viewport.left, viewport.top, viewport.right, viewport.bottom]
    .every(Number.isFinite)
    && actor.right > actor.left && actor.bottom > actor.top
    && viewport.right > viewport.left && viewport.bottom > viewport.top
    && actor.left >= viewport.left && actor.right <= viewport.right
    && actor.top >= viewport.top && actor.bottom <= viewport.bottom
}

/** This is an event-driven presentation boundary only. It neither moves an
 * actor nor changes task/attendance state, and does no layout work on the
 * locomotion RAF. Candidate changes, clipping, scrolling and resize coalesce. */
export function useOfficeAmbientViewportEligibility(
  scrollerRef: Readonly<{ current: HTMLDivElement | null }>,
  candidateKey: string,
  onChange: OfficeSceneSurfaceProps['onAmbientEligibleChange'],
): void {
  const callbackRef = useRef(onChange)
  callbackRef.current = onChange
  const publishedRef = useRef<Readonly<{ key: string; ids: readonly string[] }>>({ key: '[]', ids: Object.freeze([]) })
  const deliveredRef = useRef<Readonly<{ callback: typeof onChange; key: string }> | null>(null)
  const subscribed = Boolean(onChange)

  useLayoutEffect(() => {
    let disposed = false
    let pendingFrame: number | null = null
    const publish = (ids: readonly string[]) => {
      if (disposed) return
      const key = JSON.stringify(ids)
      if (publishedRef.current.key !== key) publishedRef.current = { key, ids: Object.freeze([...ids]) }
      const callback = callbackRef.current
      if (callback && (deliveredRef.current?.callback !== callback || deliveredRef.current.key !== key)) {
        deliveredRef.current = { callback, key }
        callback(publishedRef.current.ids)
      }
    }
    const candidates = new Set((JSON.parse(candidateKey) as readonly (readonly [string, ...unknown[]])[]).map(entry => entry[0]))
    const scroller = scrollerRef.current
    if (!subscribed || !scroller || candidates.size === 0) {
      publish([])
      return undefined
    }
    // Buttons are the actual standing/seated characters. The overlay has the
    // same employee ID but a deliberately zero-size anchor and must not count.
    const buttons = [...scroller.querySelectorAll<HTMLButtonElement>('button.lumaOfficeEmployee[data-employee-id]')]
      .filter(button => candidates.has(button.dataset.employeeId!))
    const ancestors: HTMLElement[] = []
    for (let element = scroller.parentElement; element; element = element.parentElement) ancestors.push(element)
    const clippingAncestors = ancestors.flatMap(element => {
      const style = window.getComputedStyle(element)
      const clipsX = /^(auto|scroll|hidden|clip)$/u.test(style.overflowX || style.overflow)
      const clipsY = /^(auto|scroll|hidden|clip)$/u.test(style.overflowY || style.overflow)
      return clipsX || clipsY ? [{ element, clipsX, clipsY }] : []
    })
    const measure = () => {
      pendingFrame = null
      if (disposed) return
      const bounds = scroller.getBoundingClientRect()
      let viewport: OfficeViewportRect = {
        left: Math.max(0, bounds.left), top: Math.max(0, bounds.top),
        right: Math.min(window.innerWidth, bounds.right), bottom: Math.min(window.innerHeight, bounds.bottom),
      }
      for (const { element, clipsX, clipsY } of clippingAncestors) {
        const clip = element.getBoundingClientRect()
        viewport = {
          left: clipsX ? Math.max(viewport.left, clip.left) : viewport.left,
          right: clipsX ? Math.min(viewport.right, clip.right) : viewport.right,
          top: clipsY ? Math.max(viewport.top, clip.top) : viewport.top,
          bottom: clipsY ? Math.min(viewport.bottom, clip.bottom) : viewport.bottom,
        }
      }
      publish(buttons.filter(button => button.isConnected && isOfficeAmbientActorInViewport(button.getBoundingClientRect(), viewport))
        .map(button => button.dataset.employeeId!).sort())
    }
    const scheduleMeasure = () => {
      if (!disposed && pendingFrame === null) pendingFrame = requestSceneFrame(measure)
    }
    // Measure after the matching DOM commit and before paint. This also clears
    // current speech immediately on a task, page or attendance transition.
    measure()
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleMeasure) : null
    for (const element of [scroller, ...ancestors, ...buttons]) resizeObserver?.observe(element)
    // Native intersection observation catches position-only ancestor changes
    // and transforms (e.g. the sidebar width transition), without polling.
    const intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(scheduleMeasure, { threshold: [0, 1] }) : null
    buttons.forEach(button => intersectionObserver?.observe(button))
    window.addEventListener('scroll', scheduleMeasure, true)
    window.addEventListener('resize', scheduleMeasure)
    return () => {
      disposed = true
      if (pendingFrame !== null) cancelSceneFrame(pendingFrame)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      window.removeEventListener('scroll', scheduleMeasure, true)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [candidateKey, scrollerRef, subscribed])

  // A host callback replacement receives the current measured value, without
  // resubscribing observers or reading layout on every host/animation render.
  useLayoutEffect(() => {
    if (onChange && (deliveredRef.current?.callback !== onChange || deliveredRef.current.key !== publishedRef.current.key)) {
      deliveredRef.current = { callback: onChange, key: publishedRef.current.key }
      onChange(publishedRef.current.ids)
    }
  }, [onChange])
}

