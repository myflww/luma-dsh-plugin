import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Download, MoreHorizontal, Square, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react'
import { agentRequest } from './agent-desk-api.ts'
import './TranscriptTools.css'

type Rating = 'up' | 'down'
type Feedback = {
  reactions?: Record<string, Rating> | undefined
  rate?: ((key: string, value: Rating) => Promise<unknown>) | undefined
}
type Voice = { playing: string; ready: boolean; play(id: string, text: string): void }
const Tools = createContext<Feedback & {voice?: Voice}>({})
export function ReplyToolsProvider({ children, reactions, rate, scope }: Feedback & {children: ReactNode; scope?:string}) {
  const [playing,setPlaying]=useState(''), [voices,setVoices]=useState<SpeechSynthesisVoice[]>([])
  const [problem,setProblem]=useState('')
  const playback=useRef(''), speech=typeof window==='undefined'?undefined:window.speechSynthesis
  useEffect(()=>{
    if(!speech?.getVoices)return
    const refresh=()=>setVoices(speech.getVoices().filter(v=>v.localService))
    refresh();speech.addEventListener('voiceschanged',refresh)
    return ()=>{speech.removeEventListener('voiceschanged',refresh);if(playback.current){playback.current='';speech.cancel()}}
  },[speech])
  const [hostVoice,setHostVoice]=useState(false)
  const hostKey=useRef('')
  useEffect(()=>{
    if(voices.length || !/Windows/i.test(navigator.userAgent))return
    let active=true
    void agentRequest<{available:boolean}>('speechstatus').then(s=>{if(active)setHostVoice(s.available)}).catch(()=>{})
    return ()=>{active=false}
  },[voices.length])
  useEffect(()=>{
    if(!playing || hostKey.current!==playing)return
    let active=true
    const timer=setInterval(()=>{
      void agentRequest<{playing:string;failed:string}>('speechstatus').then(s=>{
        if(active && hostKey.current===playing && s.playing!==playing){
          hostKey.current='';setPlaying('')
          if(s.failed===playing)setProblem('朗读中断，可重新播放。')
        }
      }).catch(()=>{if(active){hostKey.current='';setPlaying('');setProblem('未能读取朗读状态。')}})
    },700)
    return ()=>{active=false;clearInterval(timer)}
  },[playing])
  useEffect(()=>{
    setPlaying('');setProblem('')
    return ()=>{
      if(hostKey.current){const key=hostKey.current;hostKey.current='';void agentRequest('stopspeech',{key}).catch(()=>{})}
      if(playback.current){playback.current='';speech?.cancel()}
    }
  },[scope,speech])
  function play(key:string,text:string){
    if(hostKey.current || !speech || !voices.length){
      if(!hostVoice)return
      setProblem('')
      if(hostKey.current===key){
        hostKey.current='';setPlaying('')
        void agentRequest('stopspeech',{key}).catch(()=>setProblem('未能停止朗读。'))
      }else{
        hostKey.current=key
        void agentRequest('readspeech',{key,text}).then(()=>{if(hostKey.current===key)setPlaying(key)}).catch(()=>{
          if(hostKey.current===key){hostKey.current='';setPlaying('');setProblem('当前设备无法朗读这条回复。')}
        })
      }
      return
    }
    const old=playback.current
    playback.current='';setPlaying('');setProblem('')
    if(old)speech.cancel()
    if(old===key)return
    const voice=voices.find(v=>v.lang.toLowerCase().startsWith('zh')) ?? voices[0]!
    const chunks=text.match(/[^。！？.!?\n]{1,160}[。！？.!?\n]*|[。！？.!?\n]+/gu) ?? []
    let index=0
    playback.current=key;setPlaying(key)
    function next(){
      if(playback.current!==key)return
      if(index>=chunks.length){playback.current='';setPlaying('');return}
      const line=new SpeechSynthesisUtterance(chunks[index++]);line.voice=voice;line.lang=voice.lang
      line.onend=next
      line.onerror=()=>{if(playback.current===key){playback.current='';setPlaying('');setProblem('朗读中断，可重新播放。')}}
      speech!.speak(line)
    }
    next()
  }
  return <Tools.Provider value={{reactions,rate,voice:{playing,ready:!!voices.length||hostVoice,play}}}>{children}{problem&&<div className="lumaToolStatus" role="status">{problem}</div>}</Tools.Provider>
}
export function replyKey(...parts:string[]){return 'reply/'+parts.map(encodeURIComponent).join('/')}
async function copyText(text:string){
  if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return}catch{/* Try the desktop WebView fallback. */}}
  const active=document.activeElement as HTMLElement|null, field=document.createElement('textarea')
  field.value=text;field.readOnly=true;field.style.cssText='position:fixed;opacity:0;pointer-events:none'
  document.body.appendChild(field)
  try{field.select();if(!document.execCommand('copy'))throw Error('未能复制，请选中正文后复制。')}
  finally{field.remove();active?.focus({preventScroll:true})}
}
export function exportReply(fileName:string,text:string){
  const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a')
  a.href=url;a.download=fileName+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function ReplyTools({id,text,author,extras}:{id:string;text:string;author:string;extras?:ReactNode}){
  const {reactions,rate,voice}=useContext(Tools)
  const [menu,setMenu]=useState(false),[copied,setCopied]=useState(false),[note,setNote]=useState(''),[pending,setPending]=useState(false)
  const region=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null)
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  useEffect(()=>()=>clearTimeout(timer.current),[])
  useEffect(()=>{
    if(!menu)return
    const outside=(e:PointerEvent)=>{if(!region.current?.contains(e.target as Node))setMenu(false)}
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setMenu(false);toggle.current?.focus()}}
    document.addEventListener('pointerdown',outside);region.current?.addEventListener('keydown',key)
    const node=region.current
    return ()=>{document.removeEventListener('pointerdown',outside);node?.removeEventListener('keydown',key)}
  },[menu])
  const playing=voice?.playing===id
  async function vote(value:Rating){if(!rate||pending)return;setPending(true);try{const result=await rate(id,value);if(!result)throw Error();setNote('')}catch{setNote('反馈未保存，请重试。')}finally{setPending(false)}}
  return <div className="lumaReplyTools" role="group" aria-label={author+'的回复操作'} ref={region}>
    <button type="button" title={copied?'已复制':'复制回复'} aria-label={copied?'已复制':'复制回复'} onClick={async()=>{try{await copyText(text);setCopied(true);setNote('');clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2000)}catch{setNote('未能复制，请选中正文后复制。')}}}>{copied?<Check/>:<Copy/>}</button>
    {([['up',ThumbsUp,'有帮助'],['down',ThumbsDown,'没帮助']] as const).map(([value,Icon,label])=><button key={value} type="button" disabled={!rate||pending} title={label} aria-label={label} aria-pressed={reactions?.[id]===value} onClick={()=>void vote(value)}><Icon/></button>)}
    <button type="button" disabled={!voice?.ready} aria-label={playing?'停止朗读':'朗读回复'} title={voice?.ready?(playing?'停止朗读':'朗读回复'):'当前设备无可用的本地朗读声音'} aria-pressed={playing} onClick={()=>voice?.play(id,text)}>{playing?<Square/>:<Volume2/>}</button>
    <button type="button" ref={toggle} title="更多回复操作" aria-label="更多回复操作" aria-expanded={menu} onClick={()=>setMenu(!menu)}><MoreHorizontal/></button>
    {menu&&<div className="lumaReplyMenu" onClick={event=>{if(event.target instanceof Element && event.target.closest('[data-record-target]')){setMenu(false);toggle.current?.focus()}}}><button type="button" onClick={()=>{exportReply('Luma-'+author+'-'+id.split('/').slice(-2).join('-'),text);setMenu(false);toggle.current?.focus()}}><Download size={15}/>导出原文</button>{extras}</div>}
    {note&&<small role="status">{note}</small>}
  </div>
}
