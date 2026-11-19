/** Hit the pixels the user currently sees, including frame changes and painted
 * furniture masks. A transparent foreground actor must not steal a lower one. */
export const OFFICE_ACTOR_ALPHA_THRESHOLD = 30

type Matrix = readonly [number, number, number, number, number, number]
const identity: Matrix = [1, 0, 0, 1, 0, 0]
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]

function localPoint(element: HTMLElement, root: HTMLElement, x: number, y: number) {
  const bounds = root.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return null
  let matrix: Matrix = identity
  for (let node: HTMLElement | null = element; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    const style = getComputedStyle(node)
    const origins = style.transformOrigin.split(' ')
    const origin = (axis: number) => { const value = origins[axis] ?? '0'; return (parseFloat(value) || 0) * (value.endsWith('%') ? (axis === 0 ? node!.offsetWidth : node!.offsetHeight) / 100 : 1) }
    const ox = origin(0), oy = origin(1)
    let transform: Matrix = identity
    if (style.transform.startsWith('matrix(')) transform = style.transform.slice(7, -1).split(',').map(Number) as unknown as Matrix
    else if (style.transform.startsWith('matrix3d(')) {
      const values = style.transform.slice(9, -1).split(',').map(Number)
      transform = [values[0]!, values[1]!, values[4]!, values[5]!, values[12]!, values[13]!]
    }
    const placed: Matrix = [transform[0], transform[1], transform[2], transform[3],
      node.offsetLeft + ox + transform[4] - transform[0]*ox - transform[2]*oy,
      node.offsetTop + oy + transform[5] - transform[1]*ox - transform[3]*oy]
    matrix = multiply(placed, matrix)
  }
  const determinant = matrix[0]*matrix[3]-matrix[1]*matrix[2]
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return null
  const px = (x-bounds.left)*root.offsetWidth/bounds.width-matrix[4]
  const py = (y-bounds.top)*root.offsetHeight/bounds.height-matrix[5]
  return { x: (matrix[3]*px-matrix[2]*py)/determinant, y: (-matrix[1]*px+matrix[0]*py)/determinant }
}

function insideClip(element: HTMLElement, root: HTMLElement, x: number, y: number) {
  const clip = getComputedStyle(element).clipPath
  if (!clip?.startsWith('polygon(')) return true
  const point = localPoint(element, root, x, y)
  if (!point) return false
  const polygon = clip.slice(8, -1).split(',').map(pair => pair.trim().split(/\s+/u).map((part, axis) =>
    parseFloat(part) * (part.endsWith('%') ? (axis === 0 ? element.offsetWidth : element.offsetHeight) / 100 : 1)))
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if ((a[1]! > point.y) !== (b[1]! > point.y)
      && point.x < (b[0]! - a[0]!) * (point.y - a[1]!) / (b[1]! - a[1]!) + a[0]!) inside = !inside
  }
  return inside
}

export function hitOfficeActorAtPoint(root: HTMLElement, x: number, y: number): HTMLButtonElement | undefined {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button.lumaOfficeEmployee')]
    .map((button, order) => ({ button, order, depth: Number(getComputedStyle(button).zIndex) || 0 }))
    .sort((a, b) => b.depth - a.depth || b.order - a.order)
  for (const { button } of buttons) {
    if (!insideClip(button, root, x, y)) continue
    for (const canvas of [...button.querySelectorAll<HTMLCanvasElement>('canvas')].reverse()) {
      if (!canvas.dataset.displayedAssetId || !canvas.width || !canvas.height) continue
      const point = localPoint(canvas, root, x, y)
      if (!point || point.x < 0 || point.y < 0 || point.x >= canvas.offsetWidth || point.y >= canvas.offsetHeight) continue
      const clip = canvas.closest<HTMLElement>('.lumaOfficeEmployeeTypingClip')
      if (clip && !insideClip(clip, root, x, y)) continue
      try {
        const context = canvas.getContext('2d')
        const alpha = context?.getImageData(Math.floor(point.x * canvas.width / canvas.offsetWidth),
          Math.floor(point.y * canvas.height / canvas.offsetHeight), 1, 1).data[3] ?? 0
        if (alpha > OFFICE_ACTOR_ALPHA_THRESHOLD) return button
      } catch { /* An unreadable or not-yet-painted frame never becomes a rectangle. */ }
    }
  }
  return undefined
}
