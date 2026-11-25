import { useEffect, useRef, useState, type RefObject, type ReactNode } from 'react'
import { ListTree, X } from 'lucide-react'

type Turn = { elem: HTMLElement; key: string; title: string }
export function TranscriptFrame({scroll,scope,children}:{scroll: RefObject<HTMLDivElement|null>;scope:string;children:ReactNode}) {
  const [turns,setTurns]=useState<Turn[]>([]),[active,setActive]=useState(0),[open,setOpen]=useState(false)
  const box=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    const log=scroll.current
    if(!log)return
    let nodes:Turn[]=[],frame=0
    function locate(){
      const top=log!.getBoundingClientRect().top+Math.min(100,log!.clientHeight/3)
      let low=0,high=nodes.length
      while(low<high){
        const mid=Math.floor((low+high)/2)
        if(nodes[mid]!.elem.getBoundingClientRect().top<=top)low=mid+1
        else high=mid
      }
      let current=Math.max(0,low-1)
      if(log!.clientHeight && log!.scrollHeight>log!.clientHeight && log!.scrollTop+log!.clientHeight>=log!.scrollHeight-2)current=Math.max(0,nodes.length-1)
      setActive(current)
    }
    function scan(){
      const entries=Array.from(log!.querySelectorAll<HTMLElement>('[data-turn-key]'),elem=>({elem,key:elem.dataset.turnKey!,title:elem.dataset.turnTitle||'无文字消息'}))
      if(nodes.length!==entries.length||nodes.some((n,i)=>n.elem!==entries[i]!.elem||n.title!==entries[i]!.title)){nodes=entries;setTurns(nodes)}
      locate()
    }
    let rescan=false
    function schedule(scanNeeded=true){
      rescan ||= scanNeeded
      if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(rescan){rescan=false;scan()}else locate()})
    }
    const onScroll=()=>schedule(false)
    setOpen(false);setTurns([]);scan()
    const observer=new MutationObserver(()=>schedule())
    observer.observe(log,{childList:true,subtree:true,attributes:true,attributeFilter:['data-turn-title','data-turn-key']})
    const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>schedule())
    resize?.observe(log);log.addEventListener('scroll',onScroll,{passive:true})
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();resize?.disconnect();log.removeEventListener('scroll',onScroll)}
  },[scroll,scope])
  useEffect(()=>{
    if(!open)return
    const outside=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false)}
    document.addEventListener('pointerdown',outside)
    return ()=>document.removeEventListener('pointerdown',outside)
  },[open])
  function jump(i:number){
    const el=scroll.current,node=turns[i]?.elem
    if(!el||!node)return
    const top=el.scrollTop+node.getBoundingClientRect().top-el.getBoundingClientRect().top-8
    el.scrollTo({top,behavior:'instant'});setActive(i);setOpen(false)
    node.tabIndex=-1;node.focus({preventScroll:true})
  }
  const points=Array.from({length:Math.min(9,turns.length)},(_,i)=>Math.round(i*(turns.length-1)/Math.max(1,Math.min(9,turns.length)-1)))
  const selectedPoint=points.reduce((best,p)=>Math.abs(p-active)<Math.abs(best-active)?p:best,0)
  return <div className="lumaTranscriptFrame">{children}{turns.length>=2&&<nav className="lumaTurnNav" aria-label="对话时间线" ref={box} onKeyDown={e=>{if(e.key==='Escape'&&open){e.stopPropagation();setOpen(false);trigger.current?.focus()}}}>
    <button type="button" className="lumaTurnIndex" ref={trigger} aria-label="对话目录" title="对话目录" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<ListTree/>}</button>
    <div className="lumaTurnTicks">{points.map(i=><button type="button" key={turns[i]!.key} title={turns[i]!.title} aria-label={'跳到第 '+(i+1)+' 轮：'+turns[i]!.title} aria-current={i===selectedPoint?'location':undefined} onClick={()=>jump(i)}><i/></button>)}</div>
    {open&&<div className="lumaTurnList"><strong>对话目录</strong><ol>{turns.map((turn,i)=><li key={turn.key}><button type="button" aria-label={'第 '+(i+1)+' 轮：'+turn.title} aria-current={i===active?'location':undefined} onClick={()=>jump(i)}><span>{i+1}</span>{turn.title}</button></li>)}</ol></div>}
  </nav>}</div>
}
