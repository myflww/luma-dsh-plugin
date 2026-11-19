export type OfficeMonitorContourPoint = readonly [number, number]

export type OfficeMonitorContourEdge = 'top' | 'right' | 'bottom' | 'left'

export type OfficeMonitorEdgeBulge = Readonly<Partial<Record<OfficeMonitorContourEdge, number>>>

export interface OfficeMonitorBezierEdge {
  readonly start: OfficeMonitorContourPoint
  readonly control: OfficeMonitorContourPoint
  readonly end: OfficeMonitorContourPoint
}

export interface OfficeMonitorContour {
  readonly isFlat: boolean
  /** Closed SVG path with four actual quadratic curves, in world coordinates. */
  readonly clipPath: string
  readonly edges: Readonly<Record<OfficeMonitorContourEdge, OfficeMonitorBezierEdge>>
  readonly safety: Readonly<{ baseMinimumStretch: number; deformationDerivativeBound: number }>
  readonly project: (u: number, v: number) => OfficeMonitorContourPoint
}
export type OfficeScreenQuad = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
]
