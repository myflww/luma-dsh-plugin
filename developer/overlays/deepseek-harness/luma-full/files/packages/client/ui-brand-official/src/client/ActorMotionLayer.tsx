import { useEffect, useRef, type ReactNode } from 'react'
import { actorPose, LANDING_MS, motionPhase, type ActorMotion } from './office2d/actorMotion.ts'

/** Animate the picture inside its stable hit target. Each draw surface uses the
 * same foot-relative poses, including when it switches from a desk to a floor. */
export function ActorMotionLayer({motion, id, height, anchor, children}:{
  motion:ActorMotion|undefined; id:string; height?:number; anchor?:{x:number;y:number}|undefined; children:ReactNode
}) {
  const node=useRef<Element|null>(null)
  const sceneHeight=useRef(height)
  sceneHeight.current=height
  useEffect(()=>{
    const target=node.current
    if(!target || !motion || !target.animate) return
    const height=sceneHeight.current
    let current:Animation
    const play=(kind:ActorMotion,start:number,duration:number,loop:boolean)=>{
      const count=Math.ceil(duration/32)
      const frames=Array.from({length:count+1},(_,i)=>{
        const pose=actorPose(kind,start+duration*i/count,kind==='idle'?motionPhase(id):0)
        // The SVG group lives at the foot. Its bounding box can include
        // clipped cells of the underlying sheet, so use explicit scene units.
        const offset=height===undefined ? `${pose.x*120}%,${-100*pose.lift}%`
          : `${pose.x*height}px,${-pose.lift*height}px`
        return {transform:`translate(${offset}) rotate(${pose.angle}deg) scale(${pose.sx},${pose.sy})`}
      })
      current=target.animate(frames,{duration,iterations:loop?Infinity:1,fill:'both'})
    }
    if(motion==='held') {
      play('held',0,300,false)
      current!.onfinish=()=>{current.cancel();play('held',300,1090,true)}
    } else if(motion==='landing') {
      play('landing',0,LANDING_MS,false)
      current!.onfinish=()=>{current.cancel();play('idle',0,4100,true)}
    } else play('idle',0,4100,true)
    return ()=>{current.onfinish=null;current.cancel()}
  },[motion,id])
  const style={transformOrigin:anchor ? `${anchor.x*100}% ${anchor.y*100}%` : '50% 100%', transformBox:'fill-box' as const}
  return height!==undefined ? <g ref={el=>{node.current=el}} data-actor-motion={motion} style={{transformOrigin:'0 0',transformBox:'view-box'}}>{children}</g>
    : <span ref={el=>{node.current=el}} data-actor-motion={motion} style={{...style,display:'block'}}>{children}</span>
}
