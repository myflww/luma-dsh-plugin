import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** A native modal keeps keyboard and pointer focus out of the live conversation. */
export function ContactPopup({kind, label, children, close}:{
  kind:'directory'|'members'; label:string; children:ReactNode; close():void
}) {
  const ref=useRef<HTMLDialogElement>(null)
  useLayoutEffect(()=>{
    const dialog=ref.current!
    const surface=dialog.closest<HTMLElement>('.lumaContacts') ?? dialog.closest<HTMLElement>('.lumaRoomConversation')!
    const selector='[data-contact-trigger="'+kind+'"]'
    const trigger=surface.querySelector<HTMLElement>(selector)
    function position() {
      const area=surface.getBoundingClientRect()
      const anchor=trigger?.getBoundingClientRect()
      const top=kind==='members' ? Math.min(anchor?.bottom ?? area.top,area.top+area.height/3)+6 : area.top
      dialog.style.setProperty('--popup-left',Math.max(0,area.left+(kind==='members'?8:0))+'px')
      dialog.style.setProperty('--popup-top',Math.max(0,top)+'px')
      dialog.style.setProperty('--popup-width',Math.max(0,area.width-(kind==='members'?16:0))+'px')
      dialog.style.setProperty('--popup-height',Math.max(0,area.bottom-top-(kind==='members'?8:0))+'px')
    }
    position()
    if (typeof dialog.showModal==='function') dialog.showModal()
    else dialog.setAttribute('open','')
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus({preventScroll:true})
    const observer=typeof ResizeObserver==='function' ? new ResizeObserver(position) : undefined
    observer?.observe(surface)
    window.addEventListener('resize',position)
    window.addEventListener('scroll',position,true)
    return ()=>{
      observer?.disconnect()
      window.removeEventListener('resize',position)
      window.removeEventListener('scroll',position,true)
      if(dialog.open && typeof dialog.close==='function') dialog.close()
      queueMicrotask(()=>{
        if(document.activeElement===document.body && surface.isConnected)
          surface.querySelector<HTMLElement>(selector)?.focus({preventScroll:true})
      })
    }
  },[kind])
  return <dialog ref={ref} aria-label={label}
    className={'lumaContactPopup '+(kind==='directory'?'lumaMessagesRoster':'lumaStudioMembers')}
    onCancel={event=>{event.preventDefault();close()}}
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}}
    onClick={event=>{
      if(event.target!==event.currentTarget)return
      const rect=event.currentTarget.getBoundingClientRect()
      if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)close()
    }}>{children}</dialog>
}
