import { memo, useId, useMemo } from 'react'
import type { OfficeScreenSurface } from './office2d/screenSurfaces.ts'
import { createOfficeMonitorContour } from './office2d/monitorScreenContour.ts'
import {
  buildOfficeMonitorScreen,
  resolveOfficeMonitorState,
  serializeOfficeMonitorPoints,
} from './office2d/monitorScreenContent.ts'

export interface OfficeMonitorScreenProps {
  readonly surface: OfficeScreenSurface
  /** Derived from real Harness employee availability, never animation mode. */
  readonly activeTask: boolean
  readonly powered?: boolean
}

/** SVG child: the parent owns visibility policy, world sizing and stacking. */
export const OfficeMonitorScreen = memo(function OfficeMonitorScreen({
  surface,
  activeTask,
  powered = true,
}: OfficeMonitorScreenProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/gu, '')
  const prefix = `office-monitor-${surface.workstationId}-${instanceId}`
  const state = resolveOfficeMonitorState({ surface, powered, activeTask })
  const shapes = useMemo(() => buildOfficeMonitorScreen(surface, state), [surface, state])
  const contour = useMemo(() => createOfficeMonitorContour(surface), [surface])
  if (state === 'off') return null
  return (
    <g className="lumaOfficeMonitorScreen" data-monitor-workstation-id={surface.workstationId} data-monitor-state={state} aria-hidden="true">
      <defs>
        <clipPath id={`${prefix}-clip`} clipPathUnits="userSpaceOnUse">
          <path d={contour.clipPath} />
        </clipPath>
        <linearGradient id={`${prefix}-wallpaper`} x1="0%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor="#264661" />
          <stop offset="55%" stopColor="#50849f" />
          <stop offset="100%" stopColor="#b6d5d4" />
        </linearGradient>
        <linearGradient id={`${prefix}-reflection`} x1="0%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#eef7ff" stopOpacity=".12" />
          <stop offset="45%" stopColor="#eef7ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#183d55" stopOpacity=".08" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${prefix}-clip)`}>
        {shapes.map((shape, index) => shape.role === 'glass' || shape.role === 'glass-reflection' ? (
          <path key={`${shape.role}-${index}`} data-screen-part={shape.role}
            d={contour.clipPath} fill={`url(#${prefix}-${shape.fill})`} opacity={shape.opacity} />
        ) : (
          <polygon
            key={`${shape.role}-${index}`}
            data-screen-part={shape.role}
            points={serializeOfficeMonitorPoints(shape.points)}
            fill={shape.fill === 'wallpaper' || shape.fill === 'reflection' ? `url(#${prefix}-${shape.fill})` : shape.fill}
            opacity={shape.opacity}
          />
        ))}
      </g>
      <path className="lumaOfficeMonitorGlassEdge" d={contour.clipPath} />
    </g>
  )
})
