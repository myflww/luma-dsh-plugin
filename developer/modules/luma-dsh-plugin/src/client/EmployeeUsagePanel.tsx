import { useEffect, useState } from 'react'
import { COMPANION_REWARDS, type CharacterId } from '../shared/local-collection-domain.ts'
import type { EmployeeUsageReport, LocalCollectionRuntime } from './local-collection-store.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import './EmployeeUsagePanel.css'

const format = new Intl.NumberFormat('zh-CN')

export function EmployeeUsagePanel({runtime, unlocked}: {runtime:LocalCollectionRuntime; unlocked:readonly CharacterId[]}) {
  const [data,setData] = useState<EmployeeUsageReport>()
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)
  const [revision,setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    async function refresh() {
      if (busy || controller.signal.aborted) return
      busy = true
      setLoading(true)
      try {
        if (!runtime.readEmployeeUsage) throw Error('请在桌面 DSH 中查看员工用量。')
        const result = await runtime.readEmployeeUsage(controller.signal)
        if (!controller.signal.aborted) { setData(result); setError('') }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '用量暂时无法读取。')
      } finally {
        busy = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void refresh()
    const check = () => { if (!document.hidden) void refresh() }
    const timer = window.setInterval(check,30000)
    document.addEventListener('visibilitychange',check)
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange',check) }
  },[runtime,revision])
  return <section className="lumaEmployeeUsage" aria-label="员工用量">
    <header><div><h3>员工用量</h3><p>每位伙伴每累计使用 100 万 token，钱包自动获得 1 星币。未满的用量留到下次。</p></div>
      <button type="button" disabled={loading} onClick={()=>setRevision(n=>n+1)}>{loading?'读取中…':'刷新用量'}</button></header>
    {error && <p role="alert">{error}</p>}
    {data && <>
      {!data.nativeHistoryComplete && <p role="status">部分历史会话暂时无法读取，下次刷新时会再核对。</p>}
      <ul>{COMPANION_REWARDS.filter(r=>unlocked.includes(r.id) || data.roles[r.id]?.totalTokens > 0).map(r=>{
        const row = data.roles[r.id]
        if (!row) return null
        return <li key={r.id}>
          <div className="lumaUsageName"><MessageAvatar {...getChibiAvatar(r.id)} /><div><strong>{r.name}</strong><span>累计 {format.format(row.totalTokens)} token</span></div></div>
          <div className="lumaUsageMeter"><progress aria-label={r.name+'的下一枚星币'} max={data.threshold} value={row.remainderTokens}/>
            <small>距下一枚还需 {format.format(data.threshold-row.remainderTokens)} token</small></div>
          <div className="lumaUsageCoins"><strong>{format.format(row.earnedCoins)}</strong> 星币</div></li>
      })}</ul></>}
  </section>
}
