import {
  getTypingFrameAnchor,
  type OfficeEmployeeTypingProfile,
} from './office2d/employeeTypingRigs.ts'
import {
  type OfficeWorkstation
} from './office2d/workstations.ts'
import type { Point } from './OfficeSceneSurface.types.ts'
export function getWorkstationTypingFrameAnchor(
  profile: OfficeEmployeeTypingProfile,
  workstation: Pick<OfficeWorkstation, 'seatPoint'>,
  frameIndex: number,
) {
  return getTypingFrameAnchor(profile, frameIndex, { seated: workstation.seatPoint !== null })
}

export { getOfficeWalkFrameWorldWidth } from './office2d/movementPresentation.ts'

export function compileOfficeMonitorPolygon(
  points: readonly (readonly [number, number])[],
): string {
  const ordered = [points[0], points[1], points[3], points[2]]
  return ordered
    .filter((point): point is readonly [number, number] => point !== undefined)
    .map(([x, y]) => `${x},${y}`)
    .join(' ')
}

export function compileOfficeEmployeeVisibleClipPath({
  polygon,
  base,
  width,
  height,
  anchor,
  rotation,
}: Readonly<{
  polygon: readonly (readonly [number, number])[]
  base: Readonly<{ x: number; y: number }>
  width: number
  height: number
  anchor: Readonly<{ x: number; y: number }>
  rotation: number
}>): string | undefined {
  if (polygon.length < 3 || width <= 0 || height <= 0) return undefined
  const points = polygon.map(point => projectOfficeWorldPointToEmployee({
    point,
    base,
    width,
    height,
    anchor,
    rotation,
  }))
  const percent = (value: number): string => `${Math.round(value * 10_000) / 10_000}%`
  return `polygon(${points.map(({ x, y }) => `${percent(x / width * 100)} ${percent(y / height * 100)}`).join(', ')})`
}

function projectOfficeWorldPointToEmployee({
  point,
  base,
  width,
  height,
  anchor,
  rotation,
}: Readonly<{
  point: readonly [number, number]
  base: Readonly<{ x: number; y: number }>
  width: number
  height: number
  anchor: Readonly<{ x: number; y: number }>
  rotation: number
}>): Point {
  const originX = width / 2
  const originY = height
  const translateX = -anchor.x * width
  const translateY = -anchor.y * height
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const translatedX = point[0] - base.x - originX - translateX
  const translatedY = point[1] - base.y - originY - translateY
  return {
    x: originX + cosine * translatedX + sine * translatedY,
    y: originY - sine * translatedX + cosine * translatedY,
  }
}

export function compileOfficeEmployeeOcclusionPolygons({
  polygons,
  base,
  width,
  height,
  anchor,
  rotation,
  frameWidth,
  frameHeight,
}: Readonly<{
  polygons: readonly (readonly (readonly [number, number])[])[]
  base: Readonly<{ x: number; y: number }>
  width: number
  height: number
  anchor: Readonly<{ x: number; y: number }>
  rotation: number
  frameWidth: number
  frameHeight: number
}>): readonly (readonly (readonly [number, number])[])[] {
  if (width <= 0 || height <= 0 || frameWidth <= 0 || frameHeight <= 0) return []
  return polygons.map(polygon => polygon.map(point => {
    const local = projectOfficeWorldPointToEmployee({
      point,
      base,
      width,
      height,
      anchor,
      rotation,
    })
    return [local.x / width * frameWidth, local.y / height * frameHeight] as const
  }))
}



