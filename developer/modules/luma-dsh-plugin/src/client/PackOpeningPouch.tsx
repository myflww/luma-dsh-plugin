import { useEffect, useId, useState, type CSSProperties } from 'react'
import './PackOpeningPouch.css'

type Direction = 'ltr' | 'rtl'
type Pull = { x: number; y: number }

export interface PackOpeningPouchProps {
  src: string
  alt: string
  phase: 'sealed' | 'tearing' | 'emerging' | 'revealed'
  progress: number
  direction?: Direction
  pull?: Pull
  active?: boolean
}

export interface PouchSealBounds { left: number; right: number; top: number; seam: number }
const sealBounds: Record<string, PouchSealBounds> = {
  dawn: { left: 11.4, right: 88.6, top: 3.9, seam: 10.3 },
  'blue-rose': { left: 12, right: 88, top: 2.8, seam: 8.45 },
  moon: { left: 9.6, right: 90.4, top: 4, seam: 9.5 },
  gemini: { left: 10.6, right: 89.2, top: 3.75, seam: 10 },
  grok: { left: 10.1, right: 90.1, top: 2.6, seam: 8.25 },
}
const clamp = (value: number, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0

/** Percentages are measured at the top heat seal of each PNG, including its transparent padding. */
export function getPouchSealBounds(src: string): PouchSealBounds {
  const name = /(?:^|\/)([\w-]+)-(?:v1|cutout-r1)\.png(?:[?#].*)?$/u.exec(src)?.[1]
  return name && sealBounds[name] || { left: 0, right: 100, top: 0, seam: 7 }
}

function seamY(bounds: PouchSealBounds, x: number) {
  const fraction = (x - bounds.left) / (bounds.right - bounds.left)
  return bounds.seam + Math.sin(fraction * Math.PI * 38) * .14 + Math.sin(fraction * Math.PI * 9) * .11
}

/** Each pair of edges uses the same samples, so the foil still fits exactly against the bag. */
function cutEdge(bounds: PouchSealBounds, start: number, cut: number) {
  const count = Math.max(1, Math.ceil(Math.abs(cut - start)))
  return Array.from({ length: count + 1 }, (_, index) => {
    const x = start + (cut - start) * index / count
    return { x, y: seamY(bounds, x) }
  })
}

function FoilStrip({ src, bounds, start, cut, amount, pull, direction, edge }: {
  src: string; bounds: PouchSealBounds; start: number; cut: number; amount: number
  pull: Pull; direction: Direction; edge: ReturnType<typeof cutEdge>
}) {
  const texture = useId()
  const span = Math.abs(cut - start)
  const sign = direction === 'ltr' ? 1 : -1
  const load = clamp(amount * .85 + Math.abs(pull.x) * .85)
  const lift = clamp(-3.7 * load + pull.y * 56, -7.2, 5.8)
  // Map distance along the loose foil into screen coordinates. At t=0 both the
  // top and the bottom of the strip stay attached, regardless of the hand angle.
  const pose = (t: number) => ({
    x: cut - sign * span * (t - .81 * load * t * t),
    y: lift * t - 1.5 * load * Math.sin(Math.PI * t),
  })
  const panels = Math.max(1, Math.ceil(span / 3.5))
  const folds = []
  for (let index = 0; index < panels; index++) {
    const t0 = index / panels, t1 = (index + 1) / panels
    const a = pose(t0), b = pose(t1)
    const x0 = cut + (start - cut) * t0, x1 = cut + (start - cut) * t1
    const scaleX = (b.x - a.x) / (x1 - x0), skewY = (b.y - a.y) / (x1 - x0)
    // A subpixel overlap within the shared strip removes raster seams between facets.
    const lo = Math.min(x0, x1) - .12, hi = Math.max(x0, x1) + .12
    const shade = 1 - .15 * load * Math.sin(Math.PI * t0) + .09 * load * t0
    folds.push(<rect key={index} x={lo} y={bounds.top} width={hi - lo} height={bounds.seam - bounds.top + .5}
      transform={`matrix(${scaleX} ${skewY} 0 1 ${a.x - scaleX * x0} ${a.y - skewY * x0})`}
      fill={`url(#${texture})`} style={{ filter: `brightness(${shade})` }} />)
  }
  const outline = [`${start},${bounds.top}`, `${cut},${bounds.top}`, ...[...edge].reverse().map(p => `${p.x},${p.y}`)].join(' ')
  return <svg className="lumaPouchArtworkCap" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <clipPath id={texture + '-edge'}><polygon points={outline} /></clipPath>
      <pattern id={texture} width="100" height="100" patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse">
        <image href={src} width="100" height="100" preserveAspectRatio="none" clipPath={`url(#${texture}-edge)`} />
      </pattern>
    </defs>
    {folds}
  </svg>
}

/** Pointer capture and saved acquisitions stay in the scene. */
export function PackOpeningPouch({ src, alt, phase, progress, direction = 'ltr', pull = { x: 0, y: 0 }, active = false }: PackOpeningPouchProps) {
  const [autoProgress, setAutoProgress] = useState(0)
  const automatic = phase === 'tearing' && pull.x === 0
  useEffect(() => {
    if (!automatic) { setAutoProgress(0); return }
    const start = performance.now()
    let frame: number
    const tick = (now: number) => {
      const time = clamp((now - start) / 270)
      setAutoProgress(time * time * (3 - 2 * time))
      if (time < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [automatic])
  const amount = phase === 'sealed' ? clamp(progress) : automatic ? autoProgress : 1
  const bounds = getPouchSealBounds(src)
  const sign = direction === 'ltr' ? 1 : -1
  const start = direction === 'ltr' ? bounds.left : bounds.right
  const cut = start + sign * (bounds.right - bounds.left) * amount
  const edge = cutEdge(bounds, start, cut)
  const intactSide = direction === 'ltr' ? 100 : 0
  const outerSide = 100 - intactSide
  const body = amount > 0
    ? `polygon(${outerSide}% ${bounds.seam}%, ${edge.map(p => `${p.x}% ${p.y}%`).join(', ')}, ${cut}% 0%, ${intactSide}% 0%, ${intactSide}% 100%, ${outerSide}% 100%)`
    : 'none'
  const style = {
    '--pouch-flight-x': `${sign * 19 + clamp(pull.x, -1, 1) * 8}%`,
    '--pouch-flight-y': `${-13 + clamp(pull.y, -.35, .35) * 21}%`,
    '--pouch-flight-angle': `${sign * 23}deg`,
    '--pouch-flight-origin': `${cut}% ${bounds.seam}%`,
  } as CSSProperties
  return <div className="lumaPouchArtwork" data-phase={phase} data-direction={direction} data-progress={amount.toFixed(3)} data-cut={cut.toFixed(3)} data-active={active} data-progressing={phase === 'sealed' && amount > 0} style={style}>
    <div className="lumaPouchArtworkBody" style={{ clipPath: body }}><img src={src} alt={alt} draggable={false} /></div>
    <div className="lumaPouchArtworkFlight" data-automatic={automatic} aria-hidden="true">
      {amount > 0 && (phase === 'sealed' || phase === 'tearing') &&
        <FoilStrip src={src} bounds={bounds} start={start} cut={cut} amount={amount} pull={pull} direction={direction} edge={edge} />}
    </div>
  </div>
}

