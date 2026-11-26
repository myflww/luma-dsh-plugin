import { useEffect, useRef } from 'react'
import { officeDeskFrame, type OfficeDeskDrawing } from './office2d/officeDeskPlacement.ts'

type Point=readonly [number,number]
type Polygon=readonly Point[]
type Props={pose:OfficeDeskDrawing;actor:string;working:boolean;ambient:boolean;paused:boolean;fixed?:number|undefined;cover?:readonly Polygon[]|undefined;visible?:Polygon|null|undefined}

/** Paint the same registered cell used by the standalone theme canvas. */
export function OfficeDeskCanvas(props:Props){
  const canvas=useRef<HTMLCanvasElement>(null),live=useRef(props)
  live.current=props
  const signature=JSON.stringify([props.pose,props.cover,props.visible,props.fixed,props.paused,props.working,props.ambient])
  useEffect(()=>{
    const el=canvas.current,ctx=el?.getContext('2d')
    if(!el||!ctx)return
    const image=new Image();let raf=0,cancelled=false,last=-1,start=0
    const draw=(now:number)=>{
      if(cancelled)return
      const {pose,actor,working,ambient,paused,fixed,cover,visible}=live.current
      if(!start)start=now
      const i=fixed===undefined?officeDeskFrame(pose,actor,now-start,working&&!paused,ambient):Math.max(0,Math.floor(fixed))%pose.count
      if(i!==last){
        const [w,h]=pose.cell
        ctx.clearRect(0,0,w,h);ctx.save()
        if(pose.mirror){ctx.translate(w,0);ctx.scale(-1,1)}
        ctx.drawImage(image,i*w,pose.bank*h,w,h,0,0,w,h);ctx.restore()
        const polygon=(p:Polygon)=>{
          ctx.beginPath()
          for(const [j,[x,y]] of p.entries()){
            const u=(x-pose.origin[0])/pose.scale,v=(y-pose.origin[1])/pose.scale
            if(j)ctx.lineTo(u,v);else ctx.moveTo(u,v)
          }
          ctx.closePath();ctx.fill()
        }
        ctx.save()
        if(visible){ctx.globalCompositeOperation='destination-in';polygon(visible)}
        ctx.globalCompositeOperation='destination-out'
        for(const p of cover??[])polygon(p)
        ctx.restore()
        last=i;el.dataset.deskFrame=String(i);el.dataset.displayedPoseSrc=pose.src
      }
      if(working&&!paused&&fixed===undefined)raf=requestAnimationFrame(draw)
    }
    image.onload=()=>{if(!cancelled)draw(performance.now())};image.src=live.current.pose.src
    return ()=>{cancelled=true;image.onload=null;cancelAnimationFrame(raf)}
  },[signature,props.actor])
  return <canvas ref={canvas} className="lumaOfficeEmployeeTypingCanvas" width={props.pose.cell[0]} height={props.pose.cell[1]} />
}
