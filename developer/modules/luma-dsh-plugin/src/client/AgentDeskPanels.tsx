import { ReplyTools, replyKey, exportReply } from './ReplyTools.tsx'
import { useEffect, useRef, useState } from 'react'
import { agentRequest, inProgress, type AgentJob, type AgentMemory, type AgentState } from './agent-desk-api.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import { AttachmentNames } from './ChatAttachments.tsx'
import { ManageRecordButton } from './ContactRecords.tsx'
import { RolePortraitPanel } from './RolePortraitPanel.tsx'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'

export function EmployeeFace({ id, skin }: { id: string; skin?: string | undefined }) {
  const avatar = getChibiAvatar(id, skin)
  return <MessageAvatar src={avatar.src} viewport={avatar.viewport} />
}
const statusText = { queued: '等待接手', running: '进行中', done: '已完成', failed: '失败', cancelled: '已取消' }
const jobName = { chat: '对话', task: '单人任务', team: '协作任务' }
export function exportResult(jobId: string, employee: string, output: string) {
  exportReply('Luma-' + employee + '-' + jobId,output)
}
export function JobCard({ job, names, skins, canWrite, cancel, onManage }: {
  job: AgentJob; names: Record<string,string>; skins: Readonly<Record<string,string>>; canWrite: boolean; cancel(): void; onManage():void
}) {
  return <section className="lumaDeskJob" data-turn-key={job.id} data-turn-title={job.text.slice(0,64)} aria-label={jobName[job.mode]}>
    <header><strong>{jobName[job.mode]}</strong><time>{new Date(job.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
      <span data-status={job.status}>{statusText[job.status]}</span>
      {canWrite && inProgress(job.status) && <button type="button" onClick={cancel}>取消</button>}</header>
    <p className="lumaDeskRequest">{job.text}</p>
    <AttachmentNames items={job.attachments}/>
    <ol>{job.steps.map((step, index) => <li key={step.roleId}><EmployeeFace id={step.roleId} skin={skins[step.roleId]} />
      <div><header><strong>{names[step.roleId] ?? step.roleId}</strong>{job.mode === 'team' && <span>第 {index + 1} 棒</span>}
        <small>{statusText[step.status]}</small></header>{step.output && <p>{step.output}</p>}
        {step.status==='done' && step.output && <ReplyTools id={replyKey('job',job.id,step.roleId,step.phase ?? 'relay')} author={names[step.roleId] ?? step.roleId} text={step.output} extras={<><ManageRecordButton onClick={onManage}/>{canWrite && <CloudOfficeLauncher roleId={step.roleId} name={names[step.roleId] ?? step.roleId} initialText={step.output}/>}</>}/>}</div></li>)}</ol>
    {job.error && <p role="alert" className="lumaDeskError">{job.error}</p>}
    {!job.steps.some(step=>step.status==='done'&&step.output) && <ManageRecordButton onClick={onManage}/>}
  </section>
}
interface PanelProps { roleId: string; name: string; canWrite: boolean; refresh(): Promise<unknown>; close(): void }
export { AgentServicePanel } from './RoleModelPanel.tsx'
export function AgentMemoryPanel({ roleId, name, canWrite, refresh, close, house, count }: PanelProps & {
  house: AgentState['loveHouse'] | undefined; count: number
}) {
  const [styles,setStyles]=useState<{key:string;label:string;value:string}[]>([])
  const [entries, setEntries] = useState<AgentMemory[]>([]), [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [loaded, setLoaded] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const lock = useRef(false)
  useEffect(() => {
    const request = new AbortController()
    void agentRequest<{ entries: AgentMemory[]; styles?:typeof styles }>('memory', { roleId }, request.signal).then(result => {
      if (!request.signal.aborted) { setEntries(result.entries); setStyles(result.styles ?? []); setLoaded(true) }
    }).catch(error => { if (!request.signal.aborted) setNote(error instanceof Error ? error.message : '记忆读取失败。') })
    return () => request.abort()
  }, [roleId, count, epoch])
  async function forgetStyle(item: typeof styles[number]){
    if(lock.current || !canWrite)return
    lock.current=true;setBusy(true)
    try {
      const next=await agentRequest<{styles:typeof styles}>('forgetstyle',{roleId,key:item.key,value:item.value},AbortSignal.timeout(8000))
      setStyles(next.styles);setNote('已撤回这条相处习惯，原对话可继续查看。')
    } catch(error){setNote(error instanceof Error?error.message:'暂时无法保存。')}
    finally{lock.current=false;setBusy(false)}
  }
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
    <p>{house?.connected ? '已绑定桌面爱之屋' : house?.available ? '首次聊天会自动连接桌面爱之屋，也可立即连接。' : '当前使用本机专属记忆库。爱之屋运行后会自动同步。'}
      {house?.connected && typeof house.pending === 'number' && (house.pending > 0 ? ' · 全体员工待同步 ' + house.pending + ' 条' : ' · 记忆已同步')}</p>
    {house?.message && <p role="status">{house.message}</p>}
    {house?.reusedPortable && <p>旧记忆可在爱之屋查看。{house.localRecallRoles?.includes(roleId)?'这位伙伴目前仅从本机记录召回。':'爱之屋运行时，这位员工聊天可检索旧记忆。'}离线时新增的记录会在恢复连接后同步。</p>}
    {!house?.connected && house?.portableAvailable && <p>桌面 Luma 便携版已绑定八个员工库。复用后，两版会把同一员工的新记忆写入同一个库。</p>}
    {!house?.connected && house?.portableAvailable && <button type="button" className="is-primary" disabled={!canWrite || busy} onClick={() => void act('portable')}>复用便携版的八个记忆库</button>}
    {!house?.connected && <button type="button" disabled={!house || !canWrite || busy} onClick={() => void act('new')}>{house?.portableAvailable ? '新建独立的八个记忆库' : '连接桌面爱之屋'}</button>}
    <RolePortraitPanel key={roleId} roleId={roleId} name={name} canWrite={canWrite} refreshKey={count+epoch}/>
    <section className="lumaLearnedStyles"><h3>你们的相处习惯</h3><p>在私聊里告诉{name}「下次先给结论」或「别叫我老板」。以后可以直接改口，也可以在这里撤回。</p>
      {styles.length ? <ul>{styles.map(item=><li key={item.key}><span><small>{item.label}</small>{item.value}</span><button type="button" disabled={!canWrite || busy} aria-label={'撤回'+item.label} onClick={()=>void forgetStyle(item)}>撤回</button></li>)}</ul> : loaded && <small>还没有约定过相处习惯。</small>}
    </section>
    <label>新增记忆<textarea value={draft} maxLength={4000} placeholder="例如客户偏好、既定约定或项目背景" onChange={e => setDraft(e.target.value)} /></label>
    <button type="button" className="is-primary" disabled={!canWrite || busy || !draft.trim()} onClick={() => void act('remember')}>保存记忆</button>
    {note && <p role="status">{note}</p>}
    <h3>本机记忆记录</h3>{loaded && !entries.length && <p>当前插件尚未保存这位员工的本机记忆。</p>}
    <ol className="lumaAgentMemories">{[...entries].sort((a,b) => b.createdAt - a.createdAt).map(entry => <li key={entry.id}>
      <time>{new Date(entry.createdAt).toLocaleString('zh-CN')}</time><p>{entry.text}</p>
      {entry.reflection && <details><summary>{name}后来想到的事</summary><p>{entry.reflection.thought}</p><small>当时的话 · {entry.reflection.evidence}</small></details>}
    </li>)}</ol>
  </aside>
}
