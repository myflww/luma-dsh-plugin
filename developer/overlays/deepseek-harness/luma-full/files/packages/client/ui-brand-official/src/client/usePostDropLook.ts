import { useEffect,useRef } from 'react'
import { PostDropLook } from './office2d/postDropLook.ts'

export function usePostDropLook() {
  const store=useRef<PostDropLook|null>(null)
  const look=store.current??(store.current=new PostDropLook())
  useEffect(()=>{
    const move=(event:PointerEvent)=>{if(event.pointerType==='mouse' && event.isPrimary!==false)look.move(event.clientX,event.clientY)}
    const cancel=()=>look.cancel()
    const hidden=()=>{if(document.hidden)cancel()}
    window.addEventListener('pointermove',move,true)
    window.addEventListener('blur',cancel)
    document.addEventListener('visibilitychange',hidden)
    return ()=>{
      window.removeEventListener('pointermove',move,true)
      window.removeEventListener('blur',cancel)
      document.removeEventListener('visibilitychange',hidden)
      cancel()
    }
  },[look])
  return look
}
