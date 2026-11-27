import type { OfficeDeskDrawing } from './officeDeskPlacement.ts'

/** A seated exposure already contains the hands at their painted depth. */
export function drawOfficeDeskFrame(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  pose: OfficeDeskDrawing,
  frame: number,
  x: number,
  y: number,
  scale: number,
) {
  const [width, height] = pose.cell
  const left = frame * width
  const top = pose.bank * height
  const renderedWidth = width * scale
  const renderedHeight = height * scale
  if (!pose.mirror && !pose.hiddenShins) {
    context.drawImage(source, left, top, width, height, x, y, renderedWidth, renderedHeight)
    return
  }
  context.save()
  try {
    context.translate(pose.mirror ? x + renderedWidth : x, y)
    if (pose.mirror) context.scale(-1, 1)
    if (pose.hiddenShins) {
      const [from, to, knee] = pose.hiddenShins
      context.beginPath()
      context.rect(0, 0, renderedWidth, renderedHeight)
      context.rect(from * scale, knee * scale, (to - from) * scale, renderedHeight - knee * scale)
      context.clip('evenodd')
    }
    context.drawImage(source, left, top, width, height, 0, 0, renderedWidth, renderedHeight)
  } finally {
    context.restore()
  }
}
