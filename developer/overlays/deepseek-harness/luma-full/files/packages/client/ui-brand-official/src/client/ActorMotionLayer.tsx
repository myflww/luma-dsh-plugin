import { getActorGestureAtlas } from './office2d/actorGestureAtlas.ts'
import { drawActorLook, getActorLookAtlas } from './office2d/actorLookAtlas.ts'
import type { PostDropLook } from './office2d/postDropLook.ts'
import type { IdleGestureSequence } from './office2d/idleGestures.ts'
import { useEffect, useRef, type SVGProps } from 'react'
import { actorMotionFrame, LANDING_MS, motionPhase, sampleGripLag, type ActorMotion } from './office2d/actorMotion.ts'
import type { ActorPoseAtlas } from './office2d/actorPoseAtlas.ts'

type Props = {
  atlas: ActorPoseAtlas
  id: string
  skinId?: string | undefined
  sequence: IdleGestureSequence
  look?: PostDropLook | undefined
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
export function ActorMotionLayer({atlas, id, skinId, sequence, look, motion, landingStartedAt, footX, footY, bodyHeight, paused, asCanvas, onError, ...viewport}: Props) {
  const picture = useRef<SVGSVGElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const baseLayer=useRef<SVGImageElement>(null)
  const gestureLayer=useRef<SVGImageElement>(null)
  const lookLayer=useRef<SVGForeignObjectElement>(null)
  const lookCanvas=useRef<HTMLCanvasElement>(null)
  const lookArt=getActorLookAtlas(id,skinId)
  const decodedLook=useRef<{src:string;head:HTMLImageElement;eyes:HTMLImageElement}|undefined>(undefined)
  useEffect(()=>()=>{decodedLook.current=undefined;look?.cancel(id)},[look,id,atlas.src])
  const decodedBase=useRef<{src:string; image:HTMLImageElement} | null>(null)
  const gestures=getActorGestureAtlas(id,skinId)
  useEffect(()=>()=>sequence.interrupt(),[sequence])
  const reportFailure = useRef(onError)
  reportFailure.current = onError
  const pointer = useRef({footX,footY,bodyHeight})
  pointer.current = {footX,footY,bodyHeight}
  const neutralAt=useRef<number|undefined>(undefined)
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
    let lookContext = context
    if(asCanvas && decodedBase.current?.src!==atlas.src){
      const image=new Image()
      image.src=atlas.src
      decodedBase.current={src:atlas.src,image}
    }
    const sheet = asCanvas ? decodedBase.current?.image : undefined
    if(paused || motion==='held')look?.cancel(id)
    if(lookArt && !paused && (motion==='held' || look?.has(id)) && decodedLook.current?.src!==lookArt.src){
      const head=new Image(),eyes=new Image()
      head.src=lookArt.src
      eyes.src=lookArt.eyesSrc
      decodedLook.current={src:lookArt.src,head,eyes}
    }
    const lookImages=decodedLook.current?.src===lookArt?.src ? decodedLook.current : undefined
    const extras = gestures && !paused && motion!=='held' ? new Image() : null
    if(extras)extras.src=gestures!.src
    let lastGesture: string | undefined
    if (motion === 'landing' && landingStart !== undefined) neutralAt.current=landingStart+LANDING_MS
    let elapsed = motion === 'idle' && neutralAt.current !== undefined && !paused
      ? Math.max(0,performance.now()-neutralAt.current) : 0
    if (motion !== 'landing') neutralAt.current=undefined
    let token = 0, frame = -1, last: number | undefined, lastEye=-1
    let looking=false
    let resumeIdle=false
    let lag: ReturnType<typeof sampleGripLag> | undefined
    const paint = (now: number) => {
      if (document.hidden) return
      elapsed += last === undefined ? 0 : Math.max(0, now - last)
      last = now
      if (motion === 'held') lag = sampleGripLag(lag, pointer.current.footX,pointer.current.footY,now,pointer.current.bodyHeight)
      let gaze: ReturnType<PostDropLook['sample']>
      if(look && look.has(id) && lookArt && !paused && motion!=='held'){
        if(canvas.current){
          const r=canvas.current.getBoundingClientRect()
          gaze=look.sample(id,now,r.x+r.width*lookArt.eyeCenter[0]/width,r.y+r.height*lookArt.eyeCenter[1]/height,
            r.height*lookArt.figureHeight/height)
        } else if(picture.current){
          const svg=picture.current, m=svg.getScreenCTM(),v=svg.viewBox.baseVal
          if(m){
            const center=new DOMPoint(v.x+lookArt.eyeCenter[0],v.y+lookArt.eyeCenter[1]).matrixTransform(m)
            gaze=look.sample(id,now,center.x,center.y,Math.abs(m.d)*lookArt.figureHeight)
          }
        }
      }
      if(gaze && lookImages?.head.complete && lookImages.head.naturalWidth){
        lookContext??=lookCanvas.current?.getContext('2d')
      }else gaze=undefined
      if(!lookContext)gaze=undefined
      if(looking && !gaze){elapsed=0;resumeIdle=true;neutralAt.current=now}
      looking=!!gaze
      const exposure = gaze ? {frame:gaze.head,gesture:undefined} : sequence.sample(resumeIdle ? 'idle' : motion,
        landingStart === undefined || resumeIdle ? elapsed : now-landingStart,
        phase, lag, paused, atlas.idleDurationsMs,
        extras?.complete && extras.naturalWidth ? gestures?.actions : undefined,releasedPose.current)
      const index=exposure.frame
      const art=gaze && lookArt ? lookArt : exposure.gesture && gestures ? gestures : atlas
      const eyesImage=lookImages?.eyes.complete && lookImages.eyes.naturalWidth ? lookImages.eyes : undefined
      const eye=gaze?(eyesImage?gaze.eyes:gaze.head):-1
      if(motion==='held') releasedPose.current=index
      if(motion==='idle') releasedPose.current=undefined
      if (frame !== index || lastGesture!==exposure.gesture || lastEye!==eye) {
        lastEye=eye
        lastGesture=exposure.gesture
        frame = index
        if(gaze && lookArt && lookImages && lookContext){
          drawActorLook(lookContext,lookArt,lookImages.head,index,eyesImage,eye)
        }else if(sheet && context){
          context.clearRect(0,0,width,height)
          context.drawImage(exposure.gesture ? extras! : sheet,
            (index % art.columns)*art.cell[0],Math.floor(index/art.columns)*art.cell[1],...art.cell,0,0,width,height)
        }
        if(!asCanvas){
          if(baseLayer.current)baseLayer.current.style.display=exposure.gesture||gaze?'none':''
          if(gestureLayer.current)gestureLayer.current.style.display=exposure.gesture?'':'none'
          if(lookLayer.current){
            const layer=lookLayer.current
            layer.style.display=gaze?'':'none'
            if(gaze){
              layer.setAttribute('x',String(index%art.columns*width))
              layer.setAttribute('y',String(Math.floor(index/art.columns)*height))
            }
          }
          target.setAttribute('viewBox',[
            index%art.columns*art.cell[0],Math.floor(index/art.columns)*art.cell[1],...art.cell,
          ].join(' '))
        }
        target.dataset.displayedPoseSrc=art.src
        if(gaze)target.dataset.lookEyes=String(eye)
        else delete target.dataset.lookEyes
        if(exposure.gesture)target.dataset.idleGesture=exposure.gesture
        else delete target.dataset.idleGesture
        target.dataset.poseFrame = String(index)
      }
      if (!paused) token = requestAnimationFrame(paint)
    }
    const visibility = () => {
      cancelAnimationFrame(token)
      last = undefined
      if(document.hidden) {
        sequence.interrupt()
        elapsed=0
        resumeIdle=motion==='landing' && landingStart!==undefined && performance.now()-landingStart>=LANDING_MS
        return
      }
      if (!sheet || sheet.complete && sheet.naturalWidth) paint(performance.now())
    }
    if (sheet) {
      if(sheet.complete) {
        if(sheet.naturalWidth)paint(performance.now())
        else reportFailure.current()
      } else {
        sheet.onload=()=>paint(performance.now())
        sheet.onerror=()=>reportFailure.current()
      }
    } else paint(performance.now())
    document.addEventListener('visibilitychange', visibility)
    return () => {
      if (sheet) {sheet.onload=null; sheet.onerror=null}
      cancelAnimationFrame(token)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [atlas, gestures, sequence, look, lookArt, id, motion, landingStart, paused, phase, asCanvas])
  if (asCanvas) return <canvas ref={canvas} className={viewport.className} width={width} height={height}
    data-actor-motion={motion} data-pose-frame={initial} aria-hidden="true"/>
  return <svg {...viewport} ref={picture} data-actor-motion={motion} data-pose-frame={initial}
    viewBox={rect(initial)} preserveAspectRatio="none" overflow="hidden" aria-hidden="true">
    <image ref={baseLayer} href={atlas.src} width={atlas.columns * width} height={Math.ceil(atlas.count / atlas.columns) * height} onError={onError}/>
    {gestures && !paused && motion!=='held' && <image ref={gestureLayer} href={gestures.src} style={{display:'none'}}
      width={gestures.columns*gestures.cell[0]} height={Math.ceil(gestures.count/gestures.columns)*gestures.cell[1]}/>}
    {lookArt && <foreignObject ref={lookLayer} width={width} height={height} style={{display:'none'}}>
      <canvas ref={lookCanvas} width={width} height={height} style={{display:'block'}} aria-hidden="true"/>
    </foreignObject>}
  </svg>
}
