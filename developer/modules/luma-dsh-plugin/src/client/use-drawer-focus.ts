import { useLayoutEffect, useRef } from 'react'

export function useDrawerFocus<T extends HTMLElement>() {
  const ref=useRef<T>(null)
  useLayoutEffect(()=>{
    const drawer=ref.current, previous=document.activeElement
    drawer?.querySelector<HTMLElement>('[data-drawer-focus]')?.focus({preventScroll:true})
    return ()=>{
      if (!(previous instanceof HTMLElement) || !previous.isConnected || !drawer?.contains(document.activeElement)) return
      // A replacement drawer may claim focus during the same commit.
      queueMicrotask(()=>{if (document.activeElement===document.body) previous.focus({preventScroll:true})})
    }
  },[])
  return ref
}
