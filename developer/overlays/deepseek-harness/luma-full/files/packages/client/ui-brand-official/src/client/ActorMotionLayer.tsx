import { useEffect, useRef, type SVGProps } from 'react'
import { actorMotionFrame, motionPhase, sampleGripLag, type ActorMotion } from './office2d/actorMotion.ts'
import type { ActorPoseAtlas } from './office2d/actorPoseAtlas.ts'

type Props = {
  atlas: ActorPoseAtlas
  id: string
  motion: ActorMotion
  landingStartedAt?: number | undefined
  footX: number
  footY: number
  bodyHeight: number
  paused: boolean
  asCanvas?: boolean
  onError: () => void
} & Pick<SVGProps<SVGSVGElement>, 'x' | 'y' | 'width' | 'height' | 'className' | 'style'>

/** Draw one full articulated exposure. Only the source rectangle changes,
 * so the floor point and event target remain stable throughout a gesture. */
export function ActorMotionLayer({atlas, id, motion, landingStartedAt, footX, footY, bodyHeight, paused, asCanvas, onError, ...viewport}: Props) {
  const picture = useRef<SVGSVGElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const reportFailure = useRef(onError)
  reportFailure.current = onError
  const pointer = useRef({footX,footY,bodyHeight})
  pointer.current = {footX,footY,bodyHeight}
  const releasedPose=useRef<number|undefined>(undefined)
  const [width, height] = atlas.cell
  const phase = motionPhase(id)
  const landingStart = motion === 'landing' ? landingStartedAt : undefined
  const initial = actorMotionFrame(motion, landingStart === undefined ? 0 : performance.now()-landingStart,
    phase, undefined, paused, atlas.idleDurationsMs, releasedPose.current)
  const rect = (index: number) => `${index % atlas.columns * width} ${Math.floor(index / atlas.columns) * height} ${width} ${height}`
  useEffect(() => {
    const target = canvas.current ?? picture.current
    if (!target) return
    const context = canvas.current?.getContext('2d')
    const sheet = asCanvas ? new Image() : null
    let token = 0, frame = -1, elapsed = 0, last: number | undefined
    let lag: ReturnType<typeof sampleGripLag> | undefined
    const paint = (now: number) => {
      if (document.hidden) return
      elapsed += last === undefined ? 0 : Math.max(0, now - last)
      last = now
      if (motion === 'held') lag = sampleGripLag(lag, pointer.current.footX,pointer.current.footY,now,pointer.current.bodyHeight)
      const index = actorMotionFrame(motion, landingStart === undefined ? elapsed : now-landingStart,
        phase, lag, paused, atlas.idleDurationsMs, releasedPose.current)
      if(motion==='held') releasedPose.current=index
      if(motion==='idle') releasedPose.current=undefined
      if (frame !== index) {
        frame = index
        if (sheet && context) {
          context.clearRect(0,0,width,height)
          context.drawImage(sheet,(index % atlas.columns)*width,Math.floor(index/atlas.columns)*height,width,height,0,0,width,height)
          target.dataset.displayedPoseSrc=atlas.src
        } else if (!asCanvas) target.setAttribute('viewBox', rect(index))
        target.dataset.poseFrame = String(index)
      }
      if (!paused) token = requestAnimationFrame(paint)
    }
    const visibility = () => {
      cancelAnimationFrame(token)
      last = undefined
      if (!sheet || sheet.complete && sheet.naturalWidth) paint(performance.now())
    }
    if (sheet) {
      sheet.onload=()=>paint(performance.now())
      sheet.onerror=()=>reportFailure.current()
      sheet.src=atlas.src
    } else paint(performance.now())
    document.addEventListener('visibilitychange', visibility)
    return () => {
      if (sheet) {sheet.onload=null; sheet.onerror=null}
      cancelAnimationFrame(token)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [atlas, id, motion, landingStart, paused, phase, asCanvas])
  if (asCanvas) return <canvas ref={canvas} className={viewport.className} width={width} height={height}
    data-actor-motion={motion} data-pose-frame={initial} aria-hidden="true"/>
  return <svg {...viewport} ref={picture} data-actor-motion={motion} data-pose-frame={initial}
    viewBox={rect(initial)} preserveAspectRatio="none" overflow="hidden" aria-hidden="true">
    <image href={atlas.src} width={atlas.columns * width} height={Math.ceil(atlas.count / atlas.columns) * height} onError={onError}/>
  </svg>
}
