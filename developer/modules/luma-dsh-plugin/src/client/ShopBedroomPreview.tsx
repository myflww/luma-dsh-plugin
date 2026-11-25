import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ShopBedroom } from '../shared/shop-bedrooms.ts'
import { SHOP_BEDROOM_ART } from './bedroom-art.generated.ts'
import './ShopBedroomPreview.css'

export function ShopBedroomPreview({room,onClose}:{room:ShopBedroom;onClose:()=>void}) {
  const [phase,setPhase]=useState<'day'|'night'>('day')
  const dialog=useRef<HTMLDialogElement>(null)
  const close=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    const el=dialog.current, previous=document.activeElement
    if(!el) return
    if(typeof el.showModal==='function') el.showModal()
    else el.setAttribute('open','')
    close.current?.focus()
    return ()=>{if(el.open) el.close?.(); if(previous instanceof HTMLElement && previous.isConnected) previous.focus()}
  },[])
  return <dialog ref={dialog} className="lumaBedroomPreview" aria-label={room.name+'预览'} data-bedroom-preview={room.id}
    onCancel={event=>{event.preventDefault();onClose()}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}}>
    <header><h2>{room.name}</h2><div role="group" aria-label="预览时段">{(['day','night'] as const).map(time=>
      <button type="button" key={time} aria-pressed={phase===time} onClick={()=>setPhase(time)}>{time==='day'?'日景':'夜景'}</button>)}</div>
      <button ref={close} type="button" aria-label="关闭预览" onClick={onClose}><X size={18}/></button></header>
    <img src={SHOP_BEDROOM_ART[room.id][phase]} alt={room.name+' · '+(phase==='day'?'日景':'夜景')}/>
  </dialog>
}
