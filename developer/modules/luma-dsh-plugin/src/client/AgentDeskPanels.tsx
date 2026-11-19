import { useEffect, useRef, useState } from 'react'
import { agentRequest, inProgress, type AgentConfig, type AgentJob, type AgentMemory, type AgentState } from './agent-desk-api.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'

export function EmployeeFace({ id, skin }: { id: string; skin?: string | undefined }) {
  const avatar = getChibiAvatar(id, skin)
  return <MessageAvatar src={avatar.src} viewport={avatar.viewport} />
}
const statusText = { queued: '等待接手', running: '进行中', done: '已完成', failed: '失败', cancelled: '已取消' }
const jobName = { chat: '对话', task: '单人任务', team: '协作任务' }
export function exportResult(jobId: string, employee: string, output: string) {
  const file = new Blob([output], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Luma-' + employee + '-' + jobId + '.md'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function JobCard({ job, names, skins, canWrite, cancel }: {
  job: AgentJob; names: Record<string,string>; skins: Readonly<Record<string,string>>; canWrite: boolean; cancel(): void
}) {
  return <section className="lumaDeskJob" aria-label={jobName[job.mode]}>
    <header><strong>{jobName[job.mode]}</strong><time>{new Date(job.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
      <span data-status={job.status}>{statusText[job.status]}</span>
      {canWrite && inProgress(job.status) && <button type="button" onClick={cancel}>取消</button>}</header>
    <p className="lumaDeskRequest">{job.text}</p>
    <ol>{job.steps.map((step, index) => <li key={step.roleId}><EmployeeFace id={step.roleId} skin={skins[step.roleId]} />
      <div><header><strong>{names[step.roleId] ?? step.roleId}</strong>{job.mode === 'team' && <span>第 {index + 1} 棒</span>}
        <small>{statusText[step.status]}</small></header>{step.output && <p>{step.output}</p>}
        {canWrite && step.status === 'done' && step.output && <CloudOfficeLauncher roleId={step.roleId} name={names[step.roleId] ?? step.roleId} initialText={step.output}/>}
        {job.mode !== 'chat' && step.status === 'done' && step.output && <button type="button" className="lumaExportStep" onClick={() => exportResult(job.id, step.roleId, step.output)}>导出成果</button>}</div></li>)}</ol>
    {job.error && <p role="alert" className="lumaDeskError">{job.error}</p>}
  </section>
}
interface PanelProps { roleId: string; name: string; canWrite: boolean; refresh(): Promise<unknown>; close(): void }
export function AgentServicePanel({ roleId, name, config, canWrite, refresh, close, forHandoff = false }: PanelProps & { config?: AgentConfig | undefined; forHandoff?: boolean }) {
  const [url, setUrl] = useState(config?.baseUrl ?? ''), [model, setModel] = useState(config?.model ?? '')
  const [secret, setSecret] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const lock = useRef(false)
  async function save(remove: boolean) {
    if (lock.current || !canWrite) return
    lock.current = true; setBusy(true); setNote('')
    try {
      await agentRequest('configure', { roleId, baseUrl: remove ? '' : url.trim(), model: remove ? '' : model.trim(),
        ...(remove ? { apiKey: '' } : secret ? { apiKey: secret } : {}) })
      setSecret('')
      if (remove) { setUrl(''); setModel('') }
      await refresh(); setNote(remove ? '已切换为 DSH 会话。' : '员工 API 服务已保存。')
    } catch (error) { setNote(error instanceof Error ? error.message : '保存失败。') }
    finally { lock.current = false; setBusy(false) }
  }
  return <aside className="lumaRoleEditor" aria-label="员工 API 服务"><header><h2>{forHandoff ? name + '的 API 服务' : 'API 服务'}</h2><button onClick={close} aria-label="关闭 API 服务">×</button></header>
    <p>{name}可使用独立的 OpenAI 兼容服务。填写服务的基础地址及模型标识。</p>
    <form onSubmit={e => { e.preventDefault(); void save(false) }}>
      <label>服务地址<input type="url" autoFocus={forHandoff} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.example.com/v1" required maxLength={2048} /></label>
      <label>模型标识<input value={model} onChange={e => setModel(e.target.value)} placeholder="服务提供的模型名称" required maxLength={200} /></label>
      <label>API 密钥<input key={roleId} type="password" autoComplete="new-password" value={secret} onChange={e => setSecret(e.target.value)} placeholder={config?.hasKey ? '已保存，留空可沿用同一服务的密钥' : '本机免密服务可留空'} /></label>
      <button className="is-primary" disabled={!canWrite || busy || !url.trim() || !model.trim()} type="submit">保存服务</button>
      {config?.model && <button type="button" disabled={!canWrite || busy} onClick={() => void save(true)}>改用 DSH</button>}
    </form>{note && <p role="status">{note}</p>}</aside>
}
export function AgentMemoryPanel({ roleId, name, canWrite, refresh, close, house, count }: PanelProps & {
  house: AgentState['loveHouse'] | undefined; count: number
}) {
  const [entries, setEntries] = useState<AgentMemory[]>([]), [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [loaded, setLoaded] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const lock = useRef(false)
  useEffect(() => {
    const request = new AbortController()
    void agentRequest<{ entries: AgentMemory[] }>('memory', { roleId }, request.signal).then(result => {
      if (!request.signal.aborted) { setEntries(result.entries); setLoaded(true) }
    }).catch(error => { if (!request.signal.aborted) setNote(error instanceof Error ? error.message : '记忆读取失败。') })
    return () => request.abort()
  }, [roleId, count, epoch])
  async function act(action: 'remember' | 'new' | 'portable') {
    if (lock.current || !canWrite) return
    lock.current = true; setBusy(true); setNote('')
    try {
      if (action !== 'remember') await agentRequest('connect', {source:action})
      else { await agentRequest('remember', { roleId, text: draft.trim() }); setDraft('') }
      await refresh(); setEpoch(value => value + 1)
      setNote(action === 'portable' ? '已复用八位员工的爱之屋记忆库。' : action === 'new' ? '已连接桌面爱之屋。' : '已存入该员工的记忆库。')
    } catch (error) { setNote(error instanceof Error ? error.message : '操作失败。') }
    finally { lock.current = false; setBusy(false) }
  }
  return <aside className="lumaRoleEditor" aria-label="员工记忆库"><header><h2>{name}的记忆库</h2><button onClick={close} aria-label="关闭记忆库">×</button></header>
    <p>{house?.connected ? '已绑定桌面爱之屋' : house?.available ? '已找到桌面爱之屋，可连接员工记忆。' : '当前使用本机员工记忆库。'}
      {house?.connected && typeof house.pending === 'number' && (house.pending > 0 ? ' · 全体员工待同步 ' + house.pending + ' 条' : ' · 记忆已同步')}</p>
    {house?.message && <p role="status">{house.message}</p>}
    {house?.reusedPortable && <p>旧记忆可在爱之屋查看。爱之屋运行时，这位员工聊天可检索旧记忆。离线时新增的记录会在恢复连接后同步。</p>}
    {!house?.connected && house?.portableAvailable && <p>桌面 Luma 便携版已绑定八个员工库。复用后，两版会把同一员工的新记忆写入同一个库。</p>}
    {!house?.connected && house?.portableAvailable && <button type="button" className="is-primary" disabled={!canWrite || busy} onClick={() => void act('portable')}>复用便携版的八个记忆库</button>}
    {!house?.connected && <button type="button" disabled={!house || !canWrite || busy} onClick={() => void act('new')}>{house?.portableAvailable ? '新建独立的八个记忆库' : '连接桌面爱之屋'}</button>}
    <label>新增记忆<textarea value={draft} maxLength={4000} placeholder="例如客户偏好、既定约定或项目背景" onChange={e => setDraft(e.target.value)} /></label>
    <button type="button" className="is-primary" disabled={!canWrite || busy || !draft.trim()} onClick={() => void act('remember')}>保存记忆</button>
    {note && <p role="status">{note}</p>}
    <h3>本机记忆记录</h3>{loaded && !entries.length && <p>当前插件尚未保存这位员工的本机记忆。</p>}
    <ol className="lumaAgentMemories">{[...entries].sort((a,b) => b.createdAt - a.createdAt).map(entry => <li key={entry.id}>
      <time>{new Date(entry.createdAt).toLocaleString('zh-CN')}</time><p>{entry.text}</p></li>)}</ol>
  </aside>
}
