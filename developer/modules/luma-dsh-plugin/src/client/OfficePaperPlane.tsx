import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Crown, Flower2, Music2, Orbit, PawPrint, Ribbon, Send, Snowflake, Waves, type LucideIcon } from 'lucide-react'
import type { ResidentId } from './bedroom-routine.ts'
import './OfficePaperPlane.css'

const postmarks:Record<ResidentId,{mark:string;icon:LucideIcon;ink:string;reply:string}>={
  jingyuniang:{mark:'浪花',icon:Waves,ink:'#226788',reply:'浪花章盖好啦。下一站靠岸，替我鸣一声笛！'},
  shan:{mark:'蝴蝶结',icon:Ribbon,ink:'#965567',reply:'给尾翼系了个蝴蝶结。飞远了，我也认得这架。'},
  'bai-shuangming':{mark:'雪花',icon:Snowflake,ink:'#397184',reply:'轻轻吹一下。看，六个雪花尖都印出来了。'},
  'lu-mi':{mark:'音符',icon:Music2,ink:'#665589',reply:'我在折痕边写了三个音。你飞一次，我哼一遍。'},
  longmama:{mark:'龙爪',icon:PawPrint,ink:'#795a91',reply:'托稳喔。小龙爪盖在这里，刚好按平翘起来的翼尖。'},
  claude:{mark:'雏菊',icon:Flower2,ink:'#a35b36',reply:'我给它藏了一朵雏菊。把机翼翻过来就看得见。'},
  gemini:{mark:'星轨',icon:Orbit,ink:'#525ca1',reply:'航线画好了。沿着这圈星轨，轮到你挑下一站。'},
  grok:{mark:'王冠',icon:Crown,ink:'#876227',reply:'王冠章好像有点歪……就这一枚，限量的。'},
}
type Point={x:number;y:number}
type Actor={id:string;name:string;availability:'working'|'available'}
type Leg={id:ResidentId;name:string;from:Point;to:Point;busy:boolean;repeat:boolean}
type Plane={phase:'aim';signed:ResidentId[];last?:Leg}|{phase:'flying'|'reply';signed:ResidentId[];last:Leg}
export type PaperPlanePick=(id:string,clientPoint:Point)=>void

export function OfficePaperPlane({active, actors, room, reduceMotion, toolbar, children}:{
  active:boolean;actors:readonly Actor[];room:string|null;reduceMotion:boolean
  toolbar:HTMLElement|null;children:(pick:PaperPlanePick|undefined)=>ReactNode
}) {
  const [plane,setPlane]=useState<Plane|null>(null)
  const stage=useRef<HTMLDivElement>(null)
  const tool=useRef<HTMLButtonElement>(null)
  const next=useRef<HTMLButtonElement>(null)
  const signature=actors.map(a=>a.id).join(',')
  useEffect(()=>{setPlane(null)},[active,room])
  useEffect(()=>{
    setPlane(current=>current && (!signature || current.last && !signature.split(',').includes(current.last.id))?null:current)
  },[signature])
  const close=()=>{setPlane(null);requestAnimationFrame(()=>tool.current?.focus({preventScroll:true}))}
  const open=Boolean(plane)
  useEffect(()=>{
    if(!open)return
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();close()}}
    const hidden=()=>{if(document.hidden)setPlane(null)}
    window.addEventListener('keydown',escape);document.addEventListener('visibilitychange',hidden)
    return ()=>{window.removeEventListener('keydown',escape);document.removeEventListener('visibilitychange',hidden)}
  },[open])
  useEffect(()=>{
    if(plane?.phase!=='flying')return
    const timer=window.setTimeout(()=>setPlane(current=>current===plane?{...plane,phase:'reply'}:current),reduceMotion?0:620)
    return ()=>window.clearTimeout(timer)
  },[plane,reduceMotion])
  useEffect(()=>{
    if(plane?.phase==='aim'){
      stage.current?.querySelector<HTMLButtonElement>('button[aria-label^="把纸飞机递给"]')?.focus({preventScroll:true})
    } else if(plane?.phase==='reply'){
      (next.current ?? tool.current)?.focus({preventScroll:true})
    }
  },[plane])
  function pick(id:string,clientPoint:Point){
    if(!active || !plane || plane.phase==='flying' || !Object.hasOwn(postmarks,id))return
    const actor=actors.find(a=>a.id===id),area=stage.current?.getBoundingClientRect()
    if(!actor || !area)return
    const normalized=(x:number,y:number):Point=>({
      x:Math.max(0,Math.min(100,(x-area.left)/Math.max(1,area.width)*100)),
      y:Math.max(0,Math.min(100,(y-area.top)/Math.max(1,area.height)*100)),
    })
    const button=tool.current?.getBoundingClientRect()
    const from=plane.last?.to ?? (button?normalized(button.left+button.width/2,button.top+button.height/2):{x:12,y:86})
    const role=id as ResidentId, repeat=plane.signed.includes(role)
    const last={id:role,name:actor.name,from,to:normalized(clientPoint.x,clientPoint.y),busy:actor.availability==='working',repeat}
    setPlane({phase:reduceMotion?'reply':'flying',signed:repeat?plane.signed:[...plane.signed,role],last})
  }
  const last=plane?.last
  const stamp=last && postmarks[last.id]
  const Stamp=stamp?.icon
  const canRelay=plane && actors.some(a=>Object.hasOwn(postmarks,a.id)&&!plane.signed.includes(a.id as ResidentId))
  const flightStyle=last && {
    '--plane-from-x':last.from.x+'%','--plane-from-y':last.from.y+'%',
    '--plane-mid-x':(last.from.x+last.to.x)/2+'%','--plane-mid-y':Math.max(3,(last.from.y+last.to.y)/2-12)+'%',
    '--plane-to-x':last.to.x+'%','--plane-to-y':last.to.y+'%',
    '--plane-turn':last.from.x<=last.to.x?'24deg':'-115deg','--stamp-ink':stamp?.ink,
  } as CSSProperties
  const live=active && actors.length>0
  return <div ref={stage} className="lumaPlaneScene" data-plane-phase={live?plane?.phase:undefined}>
    {children(live&&plane?pick:undefined)}
    {live && last && plane?.phase!=='aim' && <div className="lumaPlaneAir" aria-hidden="true" style={flightStyle}>
      {plane?.phase==='flying'?<Send size={30} className="lumaPlaneFlight"/>:Stamp&&<span className="lumaPlaneCatch"><Stamp size={21}/></span>}
    </div>}
    {toolbar && live && createPortal(<div className="lumaPlaneTool">
      <button type="button" ref={tool} aria-pressed={open} aria-label={open?'收回纸飞机':'纸飞机'} onClick={open?close:()=>setPlane({phase:'aim',signed:[]})}>
        <Send size={16} aria-hidden="true"/>{open?'收回纸飞机':'纸飞机'}
      </button>
      <div role="status" aria-live="polite" aria-atomic="true">
        {plane?.phase==='aim' && <span className="lumaPlaneHint">{last?'点下一位伙伴，继续传递':'点一位伙伴，把纸飞机递给她'}</span>}
        {plane?.phase==='reply' && last && stamp && <div className="lumaPlaneNote" style={{'--stamp-ink':stamp.ink} as CSSProperties}>
          <strong>{last.name}的回笺</strong>
          <span>{last.repeat?'你翻开机翼，她刚盖好的'+stamp.mark+'章还在。':last.busy?'她腾出一只手盖了个'+stamp.mark+'章，又接着忙手头的事。':stamp.reply}</span>
          <div className="lumaPlaneStamps" aria-label="纸飞机上的邮戳">{plane.signed.map(id=>{
            const mark=postmarks[id],Icon=mark.icon
            return <span key={id} role="img" aria-label={mark.mark+'章'} title={mark.mark+'章'} style={{color:mark.ink}}><Icon size={17}/></span>
          })}</div>
        </div>}
      </div>
      {plane?.phase==='reply' && canRelay && <button type="button" ref={next} onClick={()=>setPlane({...plane,phase:'aim'})}>再传一位</button>}
    </div>,toolbar)}
  </div>
}
