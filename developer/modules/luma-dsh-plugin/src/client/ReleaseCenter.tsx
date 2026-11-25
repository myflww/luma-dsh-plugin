import { useCallback, useEffect, useRef, useState } from 'react'
type Result = { installed:string; host:string; latest:string; url:string; checked:number; problem:string; available:boolean; dismissed:boolean }
export function useReleaseCheck() {
  const [data,setData] = useState<Result>(), [error,setError] = useState(''), [working,setWorking] = useState(false)
  const [hidden,setHidden] = useState('')
  const generation = useRef(0)
  const check = useCallback(async(action:'auto'|'check'|'skip', tag?:string) => {
    const seq = ++generation.current
    if(action==='check') setWorking(true)
    try {
      const res = await fetch('/luma-native/release?action='+action+(tag?'&tag='+encodeURIComponent(tag):''), {
        method:'POST', credentials:'same-origin', redirect:'error', cache:'no-store',signal:AbortSignal.timeout(16000)
      })
      if(!res.ok) throw Error()
      const d:Result = await res.json()
      if(seq===generation.current){setData(d);setError('')}
    } catch { if(seq===generation.current && action!=='auto')setError('更新服务暂时不可用，请重新检查。') }
    finally { if(seq===generation.current)setWorking(false) }
  },[])
  useEffect(()=>{
    const tick=()=>{if(!document.hidden)void check('auto')}
    tick()
    const timer=window.setInterval(tick,6*3600000)
    document.addEventListener('visibilitychange',tick)
    return ()=>{generation.current++;window.clearInterval(timer);document.removeEventListener('visibilitychange',tick)}
  },[check])
  return {data,error,working,hidden,check,hide:()=>setHidden(data?.latest??'')}
}
type State = ReturnType<typeof useReleaseCheck>
export function ReleaseNotice({ state }: {state:State}) {
  const d=state.data
  if(!d?.available || d.dismissed || state.hidden===d.latest) return null
  return <aside className="lumaReleaseToast" role="status"><h2>Luma 有新版本</h2><p>当前 {d.installed} · 可更新至 {d.latest}</p>
    <div><a href={d.url} target="_blank" rel="noopener noreferrer">查看更新</a><button onClick={state.hide}>稍后</button>
    <button onClick={()=>void state.check('skip',d.latest)}>跳过此版</button></div></aside>
}
export function ReleaseSettings({state}: {state:State}) {
  const d=state.data
  return <section aria-label="版本更新"><h2>版本更新</h2>
    <p>{d ? 'Luma '+d.installed+(d.host?' · DeepSeek Harness '+d.host:'') : '正在读取版本信息…'}</p>
    <div className="lumaReleaseTools"><button type="button" disabled={state.working} onClick={()=>void state.check('check')}>{state.working?'正在检查…':'检查更新'}</button>
    {d?.available && <a href={d.url} target="_blank" rel="noopener noreferrer">获取 {d.latest}</a>}</div>
    <p role="status">{state.error || d?.problem || (d?.latest ? d.available?'发现可安装的新版本。':'当前已是最新正式版。':'')}</p></section>
}
