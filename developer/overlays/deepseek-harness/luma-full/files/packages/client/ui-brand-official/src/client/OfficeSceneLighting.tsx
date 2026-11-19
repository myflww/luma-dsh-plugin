import { useEffect, useRef, useState } from 'react'
import {
  createOfficeLightingController,
  EMPTY_OFFICE_LIGHTING,
  type OfficeLightingSnapshot
} from './office2d/sceneLighting.ts'
import {
  type OfficeTimePolicy
} from './office2d/timePolicy.ts'
export function OfficeLightingImages({ lighting, plane }: Readonly<{
  lighting: OfficeLightingSnapshot
  plane: 'worldUrl' | 'foregroundUrl' | 'propsUrl'
}>) {
  return [lighting.previous, lighting.current].filter(composition => composition !== null).map(composition => (
    <div key={`${composition.phase}:${composition.theme ?? ''}`} className="lumaOfficeLightingComposition"
      data-lighting-source={composition.phase}
      data-office-theme={composition.theme}
      data-lighting-incoming={String(lighting.previous !== null && composition === lighting.current)}>
      {composition.layers.filter(layer => layer[plane]).map(layer => (
        <img key={layer.phase} className="lumaOfficeLightingImage" src={layer[plane]}
          style={{ opacity: layer.opacity }} alt="" aria-hidden="true" draggable={false} />
      ))}
    </div>
  ))
}


/** Owns crossfades and their disposal; never changes task or attendance state. */
export function useOfficeSceneLighting({ timePolicy, officeTheme, drawingPaused, reducedMotion }: Readonly<{
  timePolicy: OfficeTimePolicy
  officeTheme: string | undefined
  drawingPaused: boolean
  reducedMotion: boolean
}>) {
  const [lighting, setLighting] = useState(EMPTY_OFFICE_LIGHTING)
  const lightingControllerRef = useRef<ReturnType<typeof createOfficeLightingController> | null>(null)
  const previouslyDrawingPausedRef = useRef(drawingPaused)
  useEffect(() => {
    const controller = createOfficeLightingController({ onChange: setLighting })
    lightingControllerRef.current = controller
    return () => {
      controller.dispose()
      if (lightingControllerRef.current === controller) lightingControllerRef.current = null
    }
  }, [])
  useEffect(() => {
    const resuming = previouslyDrawingPausedRef.current && !drawingPaused
    previouslyDrawingPausedRef.current = drawingPaused
    const controller = lightingControllerRef.current
    controller?.setMotionAllowed(!drawingPaused && !reducedMotion)
    controller?.request(timePolicy.phase, { immediate: drawingPaused || resuming || reducedMotion,
      ...(officeTheme === undefined ? {} : { theme: officeTheme }) })
  }, [timePolicy.phase, officeTheme, drawingPaused, reducedMotion])
  return { lighting, lightingControllerRef }
}
