import { useEffect, useState } from 'react'
import { useContactDirectory } from './ContactDirectory.tsx'
import { COMPANION_REWARDS, type CharacterId } from '../shared/local-collection-domain.ts'
import type { EmployeeUsageReport, LocalCollectionRuntime } from './local-collection-store.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import './EmployeeUsagePanel.css'

const format = new Intl.NumberFormat('zh-CN')

export function useEmployeeUsage(read: LocalCollectionRuntime['readEmployeeUsage'], active = true) {
  const [data,setData] = useState<EmployeeUsageReport>()
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)
  const [revision,setRevision] = useState(0)
  useEffect(() => { setData(undefined); setError('') }, [read])
  useEffect(() => {
    if (!active) return
    if (!read) { setError('请在桌面 DSH 中查看员工用量。'); setLoading(false); return }
    const readReport = read
    const controller = new AbortController()
    let busy = false
    async function refresh() {
      if (busy || controller.signal.aborted || document.hidden) return
      busy = true
      setLoading(true)
      try {
        const result = await readReport(controller.signal)
        if (!controller.signal.aborted) { setData(result); setError('') }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '用量暂时无法读取。')
      } finally {
        busy = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void refresh()
    const timer = window.setInterval(refresh,30000)
    document.addEventListener('visibilitychange',refresh)
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange',refresh) }
  },[read,active,revision])
  return {data, error, loading, refresh: () => setRevision(n=>n+1)}
}

function remainingTokens(row:EmployeeUsageReport['roles'][string],threshold:number) {
  return `距下一枚还需 ${format.format(threshold - row.remainderTokens)} token`
}
export function describeEmployeeUsage(row:EmployeeUsageReport['roles'][string],threshold:number) {
  return `累计 ${format.format(row.totalTokens)} token，已获得 ${format.format(row.earnedCoins)} 星币，${remainingTokens(row,threshold)}`
}

export function EmployeeUsageMeter({name, row, threshold, compact = false}: {
  name: string; row: EmployeeUsageReport['roles'][string]; threshold: number; compact?: boolean
}) {
  const description = describeEmployeeUsage(row,threshold)
  const tenths = Math.floor(row.remainderTokens * 1000 / threshold)
  const percent = row.remainderTokens > 0 && tenths === 0 ? '<0.1%' : `${tenths / 10}%`
  return <div className={'lumaUsageMeter' + (compact ? ' is-compact' : '')} title={compact ? description : undefined}>
    {compact && <span className="lumaUsageCaption"><span>星币进度</span><span>{percent}</span></span>}
    <progress aria-label={name+'的下一枚星币'} aria-valuetext={description} max={threshold} value={row.remainderTokens}/>
    {!compact && <small>{remainingTokens(row,threshold)}</small>}
  </div>
}

export function EmployeeUsagePanel({runtime, unlocked}: {runtime:LocalCollectionRuntime; unlocked:readonly CharacterId[]}) {
  const {names}=useContactDirectory()
  const {data, error, loading, refresh} = useEmployeeUsage(runtime.readEmployeeUsage)
  return <section className="lumaEmployeeUsage" aria-label="员工用量">
    <header><div><h3>员工用量</h3><p>每位伙伴每累计使用 100 万 token，钱包自动获得 1 星币。未满的用量留到下次。</p></div>
      <button type="button" disabled={loading} onClick={refresh}>{loading?'读取中…':'刷新用量'}</button></header>
    {error && <p role="alert">{error}</p>}
    {data && <>
      {!data.nativeHistoryComplete && <p role="status">部分历史会话暂时无法读取，下次刷新时会再核对。</p>}
      <ul>{COMPANION_REWARDS.filter(r=>unlocked.includes(r.id) || data.roles[r.id]?.totalTokens > 0).map(r=>{
        const name=names[r.id] ?? r.name
        const row = data.roles[r.id]
        if (!row) return null
        return <li key={r.id}>
          <div className="lumaUsageName"><MessageAvatar {...getChibiAvatar(r.id)} /><div><strong>{name}</strong><span>累计 {format.format(row.totalTokens)} token</span></div></div>
          <EmployeeUsageMeter name={name} row={row} threshold={data.threshold}/>
          <div className="lumaUsageCoins"><strong>{format.format(row.earnedCoins)}</strong> 星币</div></li>
      })}</ul></>}
  </section>
}
