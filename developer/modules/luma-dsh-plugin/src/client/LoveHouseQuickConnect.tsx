import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BookOpen, Link2, X } from 'lucide-react'
import { agentRequest } from './agent-desk-api.ts'
import './LoveHouseQuickConnect.css'

interface HouseStatus {
  status: 'offline' | 'unbound' | 'connected' | 'mismatch' | 'unverified'
  bound:number
  verified:number
  total:number
  pending:number
  version?:string
  protocol?:string
  launchVersion?:string
  directory?:string
}
const labels: Record<HouseStatus['status'],string> = {
  offline:'离线',unbound:'等待连接',connected:'已连接',mismatch:'库绑定待核对',unverified:'服务待核对',
}

export function LoveHouseQuickConnect({ onClose }: { onClose?: () => void }) {
  const title=useId()
  const dialog=useRef<HTMLDialogElement>(null)
  const pending=useRef<AbortController | null>(null)
  const running=useRef(false)
  const modal=Boolean(onClose)
  const [status,setStatus]=useState<HouseStatus>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const connectionError=useRef(false)
  const [directory,setDirectory]=useState<string>()
  const read=useCallback(async (connect:boolean, selectedDirectory?:string) => {
    if(running.current || (!connect && pending.current)) return
    pending.current?.abort()
    const controller=new AbortController()
    pending.current=controller
    if(connect){running.current=true;setBusy(true);setError('')}
    try {
      const timeout=AbortSignal.timeout(connect ? 85000 : 12000)
      const body=selectedDirectory===undefined ? {} : {directory:selectedDirectory}
      const result=await agentRequest<HouseStatus>(connect?'houseconnect':'housestatus',body,AbortSignal.any([controller.signal,timeout]))
      if(controller.signal.aborted) return
      setStatus(result)
      if(connect){connectionError.current=false;setDirectory(undefined)}
      if(!connectionError.current) setError('')
    } catch(err) {
      if(!controller.signal.aborted && (connect || !connectionError.current)){
        connectionError.current=connect
        setError(err instanceof Error ? err.message : '请稍后重试连接。')
      }
    } finally {
      if(pending.current===controller) pending.current=null
      if(connect){running.current=false;if(!controller.signal.aborted)setBusy(false)}
    }
  },[])
  useEffect(()=>{
    void read(false)
    const id=window.setInterval(()=>{ if(!document.hidden) void read(false) },6000)
    return ()=>{window.clearInterval(id);pending.current?.abort();pending.current=null}
  },[read])
  useEffect(()=>{
    const node=dialog.current
    if(!modal || !node) return
    const previous=document.activeElement
    if(typeof node.showModal==='function') node.showModal()
    else node.setAttribute('open','')
    return ()=>{
      if(node.open && typeof node.close==='function') node.close()
      if(previous instanceof HTMLElement && previous.isConnected) previous.focus({preventScroll:true})
    }
  },[modal])
  const content=<>
    <header className="lumaHouseHeader"><span className="lumaHouseMark" aria-hidden="true"><BookOpen size={20}/></span>
      <h2 id={title}>爱之屋</h2>
      {onClose && <button type="button" className="lumaHouseClose" onClick={onClose} aria-label="关闭爱之屋连接"><X size={18}/></button>}
    </header>
    <div className="lumaHouseStatus" role="status"><strong>{busy?'正在连接…':status ? labels[status.status] : '正在检查本机连接…'}</strong>
      <span>{status?.version ? '爱之屋 '+status.version : status?.launchVersion ? '可启动 '+status.launchVersion : ''}{status?.protocol ? ' · 协议 '+status.protocol : ''}</span></div>
    {status && <p className="lumaHouseDetail">{status.status==='connected' ? '已核对 '+status.verified+' 个独立角色库。' :
      status.status==='mismatch' ? '当前爱之屋中的角色库与已有绑定不一致，请打开原来的数据目录再连接。' :
      status.status==='unverified' ? '已找到记忆服务，暂时无法核对角色库。请确认爱之屋已就绪。' :
      status.status==='unbound' ? '连接后会复用已有角色库，并为其余角色准备独立记忆库。' :
      status.bound ? '已有 '+status.bound+' 个角色库绑定。爱之屋启动后会继续同步。' :
      '连接本机爱之屋，让每位伙伴的聊天记忆分开保存。'}
      {status.pending>0 && <span>待同步 {status.pending} 条</span>}</p>}
    {status?.version && status.launchVersion && status.version!==status.launchVersion &&
      <p className="lumaHouseDetail">本机可启动 {status.launchVersion}。如需切换，请先退出当前运行的爱之屋。</p>}
    {error && <p role="alert" className="lumaHouseError">{error}</p>}
    <button type="button" className="lumaHouseConnect" disabled={busy} onClick={()=>void read(true)}>
      <Link2 size={16} aria-hidden="true"/>{busy?'连接中…':status?.status==='connected'?'重新核验并同步':status?.status==='offline' && status.launchVersion?'启动并连接':'连接爱之屋'}
    </button>
    <details className="lumaHouseDirectory">
      <summary>其他数据目录</summary>
      <form onSubmit={event=>{event.preventDefault();void read(true,(directory ?? status?.directory ?? '').trim())}}>
        <label>爱之屋数据文件夹<input value={directory ?? status?.directory ?? ''} placeholder="默认数据目录" disabled={busy}
          onChange={event=>setDirectory(event.target.value)}/></label>
        <p>请先用该目录打开爱之屋。连接时会核对已有角色库。留空可切回默认目录。</p>
        <button type="submit" disabled={busy}>核验并连接此目录</button>
        <a href="https://github.com/myflww/love-house/releases/latest" target="_blank" rel="noopener noreferrer">获取爱之屋官方版本 ↗</a>
      </form>
    </details>
  </>
  return onClose ? <dialog ref={dialog} aria-labelledby={title} className="lumaHouseCard lumaHouseDialog" onCancel={e=>{e.preventDefault();onClose()}}
    onClick={e=>{if(e.target===dialog.current){const b=dialog.current.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose()}}}>{content}</dialog>
    : <section className="lumaHouseCard" aria-labelledby={title}>{content}</section>
}
