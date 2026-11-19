import type { OfficeScreenSurface } from './screenSurfaces.ts'
import { createOfficeMonitorContour, projectOfficeMonitorContent } from './monitorScreenContour.ts'
export { createOfficeMonitorProjection } from './monitorScreenProjection.ts'

export type OfficeMonitorState = 'off' | 'idle' | 'working'
export type OfficeMonitorPoint = readonly [number, number]
export interface OfficeMonitorShape {
  readonly role: string
  readonly points: readonly OfficeMonitorPoint[]
  readonly fill: string
  readonly opacity: number
}

const WIDTH = 192
const HEIGHT = 112

export function resolveOfficeMonitorState({
  surface,
  powered,
  activeTask,
}: Readonly<{ surface: OfficeScreenSurface; powered: boolean; activeTask: boolean }>): OfficeMonitorState {
  if (!surface.renderGlow || !powered) return 'off'
  return activeTask ? 'working' : 'idle'
}

const rectangle = (x: number, y: number, width: number, height: number): readonly OfficeMonitorPoint[] =>
  [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]

const roundedRectangle = (x: number, y: number, width: number, height: number, radius: number): readonly OfficeMonitorPoint[] => {
  const points: OfficeMonitorPoint[] = []
  for (const [cx, cy, start] of [
    [x + width - radius, y + radius, -Math.PI / 2],
    [x + width - radius, y + height - radius, 0],
    [x + radius, y + height - radius, Math.PI / 2],
    [x + radius, y + radius, Math.PI],
  ] as const) {
    for (let step = 0; step <= 3; step += 1) {
      const angle = start + step / 3 * Math.PI / 2
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius])
    }
  }
  return points
}

/** Decorative local desktop UI: no business text, made-up answers or progress. */
export function buildOfficeMonitorScreen(surface: OfficeScreenSurface, state: OfficeMonitorState): readonly OfficeMonitorShape[] {
  if (state === 'off' || !surface.renderGlow) return []
  const contour = createOfficeMonitorContour(surface)
  const shapes: OfficeMonitorShape[] = []
  const add = (role: string, points: readonly OfficeMonitorPoint[], fill: string, opacity = 1) => {
    const uvPoints = points.map(([x, y]): OfficeMonitorPoint => [x / WIDTH, y / HEIGHT])
    shapes.push(Object.freeze({ role, points: Object.freeze(projectOfficeMonitorContent(contour, uvPoints)), fill, opacity }))
  }
  const rect = (role: string, x: number, y: number, w: number, h: number, fill: string, opacity = 1) => add(role, rectangle(x, y, w, h), fill, opacity)
  const round = (role: string, x: number, y: number, w: number, h: number, r: number, fill: string, opacity = 1) => add(role, roundedRectangle(x, y, w, h, r), fill, opacity)

  rect('glass', 0, 0, WIDTH, HEIGHT, 'wallpaper')
  add('wallpaper-ridge', [[0, 77], [23, 64], [47, 59], [75, 70], [104, 60], [132, 39], [164, 28], [192, 33], [192, 112], [0, 112]], '#527a9b', .62)
  add('wallpaper-ridge', [[0, 93], [34, 79], [68, 88], [97, 72], [128, 77], [157, 59], [192, 50], [192, 112], [0, 112]], '#9dcacb', .44)
  rect('menu-bar', 0, 0, WIDTH, 8, '#e7f1f7', .76)
  rect('menu-mark', 6, 3, 3, 3, '#43647d')
  rect('menu-label', 14, 3, 19, 2, '#58748a', .65)
  rect('menu-label', 39, 3, 12, 2, '#58748a', .42)
  rect('menu-status', 174, 3, 11, 2, '#58748a', .6)

  if (state === 'working') {
    round('window-shadow', 10, 17, 174, 80, 5, '#102635', .25)
    round('workspace-window', 8, 14, 174, 80, 5, '#f0f4f6')
    rect('window-chrome', 10, 16, 170, 10, '#dce6ec')
    for (const [index, color] of ['#c98281', '#cbb483', '#83ae9e'].entries()) {
      round('window-control', 15 + index * 6, 19, 3, 3, 1.5, color)
    }
    rect('window-title', 79, 20, 31, 2, '#7793a4', .6)
    rect('workspace-sidebar', 10, 27, 31, 64, '#e0e9ee')
    round('workspace-selection', 14, 34, 23, 7, 2, '#b9ceda')
    for (const y of [47, 56, 65, 74]) rect('workspace-navigation', 16, y, 15, 2, '#7793a4', .55)
    rect('editor-heading', 49, 35, 55, 3, '#5c7180')
    // Unequal static strokes imply an editor surface, not a percentage bar.
    for (const [index, width] of [84, 65, 73, 46, 77].entries()) {
      rect('editor-line', 49, 45 + index * 8, width, 2, index === 2 ? '#6e9caa' : '#a6b6c0')
    }
    rect('editor-cursor', 128, 77, 1.7, 5, '#568fb4')
    rect('inspector', 146, 30, 1, 58, '#d7e2e7')
    round('inspector-tile', 153, 35, 21, 16, 3, '#d7e5e9')
    for (const y of [58, 65, 72]) rect('inspector-line', 153, y, 18, 2, '#acbdc7')
  } else {
    round('idle-shadow', 48, 28, 100, 54, 6, '#17364a', .15)
    round('idle-card', 46, 25, 100, 54, 6, '#e7f1f5', .9)
    // A four-point Luma-like desktop emblem, not an invented task result.
    add('idle-emblem', [[96, 34], [99, 43], [108, 46], [99, 49], [96, 58], [93, 49], [84, 46], [93, 43]], '#668ca6')
    round('idle-label', 72, 64, 48, 3, 1.5, '#829eae', .7)
    round('idle-subtitle', 81, 71, 30, 2, 1, '#afc2cb', .8)
  }
  round('dock', 62, 100, 68, 10, 4, '#e4edf0', .65)
  for (const [index, color] of ['#94b6c5', '#c6d8df', '#8dabbf', '#92b5ad', '#b8c6d6'].entries()) {
    round('dock-icon', 69 + index * 11, 102, 6, 6, 1.5, color)
  }
  rect('glass-reflection', 0, 0, WIDTH, HEIGHT, 'reflection')
  return Object.freeze(shapes)
}

export function serializeOfficeMonitorPoints(points: readonly OfficeMonitorPoint[]): string {
  return points.map(([x, y]) => `${Number(x.toFixed(4))},${Number(y.toFixed(4))}`).join(' ')
}
