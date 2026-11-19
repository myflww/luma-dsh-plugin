import { useCallback, useEffect, useRef, useState } from 'react'
import { agentRequest } from './agent-desk-api.ts'
import './CloudOfficePanel.css'

const labels = { document:'排版为 Markdown', checklist:'整理为任务表 CSV', draft:'用云端模型起草' }
type Kind = keyof typeof labels
type CloudJob = {id:string; role:string; title:string; kind:Kind; status:'pending'|'running'|'done'|'failed'|'cancelled'; created:number; server:string}
type CloudState = {url:string; hasToken:boolean; jobs:CloudJob[]}
const statusNames = {pending:'待确认', running:'处理中', done:'已交付', failed:'处理失败', cancelled:'已停止'}
const problem = (error:unknown) => error instanceof Error ? error.message : '云电脑暂时无法连接。'

export function CloudOfficeConnection({onSaved, writable = true}:{onSaved?():void; writable?:boolean}) {
  const [url,setUrl] = useState(''), [saved,setSaved] = useState('')
  const [token,setToken] = useState(''), [note,setNote] = useState('')
  const [busy,setBusy] = useState(false), [ready,setReady] = useState(false)
  useEffect(() => {
    let active = true
    void agentRequest<CloudState>('cloudstate').then(c=>{ if (active) {setUrl(c.url); setSaved(c.url); setReady(true)} }).catch(e=>{if(active) setNote(problem(e))})
    return () => { active = false }
  },[])
  async function act(action:'save'|'probe'|'disconnect') {
    if (busy) return
    setBusy(true); setNote('')
    try {
      if (action === 'probe') {
        const result = await agentRequest<{kinds:Kind[]}>('cloudprobe')
        setNote('已连接，可用功能：' + result.kinds.map(k=>labels[k]).join('、'))
      } else {
        const next = await agentRequest<CloudState>('cloudconfigure',{url:action === 'disconnect' ? '' : url, token:action === 'disconnect' ? '' : token})
        setSaved(next.url); setUrl(next.url); setToken(''); onSaved?.()
        setNote(next.url ? '已保存。点击「测试连接」检查服务器能力。' : '已断开，已交付文档仍可下载。')
      }
    } catch(error) {setNote(problem(error))} finally {setBusy(false)}
  }
  return <div className="lumaCloudConnection">
    <p>在自己的云电脑运行插件目录里的 <code>cloud-office/worker.mjs</code>，再填入工作器地址和令牌。部署步骤见同目录 README.md。</p>
    <label>工作器地址<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://office.example.com" maxLength={1024}/></label>
    <label>连接令牌<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="new-password" maxLength={512} placeholder={saved ? '已保存，更换地址时需重新填写' : '工作器启动时设置的令牌'}/></label>
    <div className="lumaCloudActions">
      <button type="button" disabled={!writable || !ready || busy || !url.trim()} onClick={()=>void act('save')}>保存服务器</button>
      <button type="button" disabled={!saved || busy || url !== saved || Boolean(token)} onClick={()=>void act('probe')}>测试连接</button>
      {saved && <button type="button" disabled={!writable || busy} onClick={()=>void act('disconnect')}>断开连接</button>}
    </div>
    {note && <p role="status">{note}</p>}
  </div>
}

export function CloudOfficeLauncher(props:{roleId:string; name:string; initialText?:string; disabled?:boolean}) {
  const [open,setOpen] = useState(false)
  return <><button type="button" disabled={props.disabled} onClick={()=>setOpen(true)}>{props.initialText ? '云电脑处理' : '云电脑'}</button>
    {open && <CloudOfficePanel key={props.roleId} {...props} onClose={()=>setOpen(false)}/>}</>
}
export function CloudOfficePanel({roleId,name,initialText='',onClose}:{roleId:string;name:string;initialText?:string;onClose():void}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [state,setState] = useState<CloudState>()
  const [kind,setKind] = useState<Kind>('document'), [title,setTitle] = useState(''), [source,setSource] = useState(initialText)
  const [note,setNote] = useState(''), [busy,setBusy] = useState(false), [configure,setConfigure] = useState(false)
  const locked = useRef(false), alive = useRef(true)
  const retry = useRef<{key:string;id:string}|undefined>(undefined)
  const load = useCallback(async () => {
    const result = await agentRequest<CloudState>('cloudstate',{roleId})
    if (alive.current) setState(result)
  },[roleId])
  useEffect(() => {
    alive.current = true
    const element = dialog.current
    if (element && typeof element.showModal === 'function' && !element.open) element.showModal()
    else element?.setAttribute('open','')
    void load().catch(e=>setNote(problem(e)))
    return () => {alive.current=false; if (element?.open) element.close?.()}
  },[load])
  useEffect(() => {
    const running = state?.jobs.filter(j=>j.status === 'running' && j.server === state.url)
    if (!running?.length || busy) return
    const controller = new AbortController()
    let timer:ReturnType<typeof setTimeout>
    async function poll() {
      if (controller.signal.aborted || !running) return
      if (document.hidden) {timer=setTimeout(poll,5000);return}
      const results = await Promise.allSettled(running.map(job=>agentRequest('cloudrefresh',{roleId,id:job.id},controller.signal)))
      if (controller.signal.aborted) return
      const error = results.find(result=>result.status === 'rejected')
      if (error?.status === 'rejected') setNote(problem(error.reason))
      if (results.some(result=>result.status === 'fulfilled')) {
        try {await load();return} catch(e) {if (!controller.signal.aborted) setNote(problem(e))}
      }
      if (!controller.signal.aborted) timer=setTimeout(poll,12000)
    }
    timer=setTimeout(poll,3000)
    return () => {clearTimeout(timer); controller.abort()}
  },[state,busy,load,roleId])
  async function act(action:'submit'|'refresh'|'retry'|'result'|'cancel', job?:CloudJob) {
    if (locked.current) return
    locked.current = true; setBusy(true); setNote('')
    try {
      if (action === 'submit') {
        const values = {name, roleId, server:state?.url, title:title.trim() || source.trim().split('\n')[0]!.slice(0,70), text:source.trim(), kind}
        const key = JSON.stringify([state?.url,values])
        if (retry.current?.key !== key) retry.current = {key,id:crypto.randomUUID()}
        await agentRequest('cloudsubmit',{...values,id:retry.current.id})
        retry.current = undefined
        setSource(''); setTitle(''); setNote('已提交，可在下方查看交付物。')
      } else if (job && action === 'result') {
        const result = await agentRequest<{output:string;kind:Kind}>('cloudresult',{id:job.id,roleId})
        const csv = result.kind === 'checklist'
        const href = URL.createObjectURL(new Blob([result.output],{type:csv ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8'}))
        const a = document.createElement('a'); a.href=href; a.download=job.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,72)+(csv ? '.csv' : '.md')
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(href),1000)
      } else if (job) await agentRequest(action === 'cancel' ? 'cloudcancel' : action === 'retry' ? 'cloudretry' : 'cloudrefresh',{roleId,id:job.id})
    } catch(error) {setNote(problem(error))}
    finally {await load().catch(e=>setNote(problem(e))); locked.current=false; setBusy(false)}
  }
  return <dialog className="lumaCloudDialog" ref={dialog} aria-label={name+'的云电脑'} onCancel={e=>{e.preventDefault();onClose()}}>
    <header><h2>{name}的云电脑</h2><button type="button" onClick={onClose} aria-label="关闭云电脑">×</button></header>
    {state && <>
      <p>{state.url || '尚未连接云办公服务器。'} <button type="button" onClick={()=>setConfigure(!configure)}>{configure?'收起设置':'配置连接'}</button></p>
      {configure && <CloudOfficeConnection onSaved={()=>void load().catch(e=>setNote(problem(e)))}/>}
      {state.url && <><label>工作内容<select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(labels).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
        <label>文档标题<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="留空时使用材料首行" maxLength={100}/></label>
        <label>{kind === 'draft' ? '写作要求与材料' : '待处理材料'}<textarea value={source} onChange={e=>setSource(e.target.value)} maxLength={24000} rows={5} placeholder={kind === 'checklist' ? '每行一项待办，可使用 [x] 标记完成项' : '填写本次任务所需内容'}/></label>
        <p>提交时将员工名、标题和材料发送到上方服务器。{kind === 'draft' && '工作器将调用服务器上配置的写作模型。'}</p>
        <button type="button" className="is-primary" disabled={busy||!source.trim()||source.trim().length>24000} onClick={()=>void act('submit')}>提交到云电脑</button>
      </>}
      {!!state.jobs.length && <section aria-label="云任务记录"><h3>最近的云任务</h3><ul>{state.jobs.map(job=><li key={job.id}>
        <strong>{job.title}</strong><small>{statusNames[job.status]} · {new Date(job.created).toLocaleString('zh-CN')}</small>
        {job.status === 'done' ? <button type="button" disabled={busy} onClick={()=>void act('result',job)}>下载交付物</button>
          : job.status === 'failed' ? <small>请检查服务器模型设置后重新派工。</small> : job.status === 'cancelled' ? null : <div className="lumaCloudActions">
              <button type="button" disabled={busy||job.server!==state.url} onClick={()=>void act('refresh',job)}>查询状态</button>
              <button type="button" disabled={busy||job.server!==state.url} onClick={()=>void act('cancel',job)}>停止云任务</button>
              {job.status === 'pending' && <button type="button" disabled={busy||job.server!==state.url} onClick={()=>void act('retry',job)}>重试同一任务</button>}</div>}
      </li>)}</ul></section>}
    </>}
    {(note || !state) && <p role="status">{note || '读取云电脑设置…'}</p>}
  </dialog>
}
