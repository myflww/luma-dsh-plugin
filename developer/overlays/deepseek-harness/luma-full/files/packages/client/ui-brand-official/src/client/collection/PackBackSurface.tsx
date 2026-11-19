import { useEffect, useRef, useState } from 'react'
import { createPackBackSurface, type PackBackFamily, type PackBackSurfaceHandle, type PackLighting } from './packBackMaterial.js'

/** The untouched image beneath this canvas remains available while loading or if WebGL fails. */
export function PackBackSurface({ url, packId, lighting, yaw, pitch, onAvailabilityChange }: {
  url: string
  packId: PackBackFamily
  lighting: PackLighting
  yaw: number
  pitch: number
  onAvailabilityChange?(available: boolean | null): void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const surface = useRef<PackBackSurfaceHandle | null>(null)
  const latest = useRef({ lighting, yaw, pitch, onAvailabilityChange })
  latest.current = { lighting, yaw, pitch, onAvailabilityChange }
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const target = canvas.current
    if (!target) return
    let alive = true
    setReady(false)
    latest.current.onAvailabilityChange?.(null)
    const handle = createPackBackSurface(target, { url, packId,
      onReady() {
        if (!alive) return
        surface.current?.update(latest.current)
        setReady(true)
        latest.current.onAvailabilityChange?.(true)
      },
      onError() {
        if (!alive) return
        setReady(false)
        latest.current.onAvailabilityChange?.(false)
      },
    })
    surface.current = handle
    handle.update(latest.current)
    return () => { alive = false; handle.dispose(); surface.current = null }
  }, [url, packId])
  useEffect(() => { surface.current?.update({ lighting, yaw, pitch }) }, [lighting, yaw, pitch])

  return <canvas ref={canvas} className="lumaPackBackSurface" data-ready={ready} aria-hidden="true" />
}
