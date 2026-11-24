import { useState } from 'react'
import { agentRequest } from './agent-desk-api.ts'

export function DeleteWorkRecord({id, refresh}: {id:string; refresh():Promise<unknown>}) {
  const [confirm,setConfirm] = useState(false), [busy,setBusy] = useState(false), [issue,setIssue] = useState('')
  async function remove() {
    if (busy) return
    setBusy(true); setIssue('')
    try {
      await agentRequest('deletejob',{id},AbortSignal.timeout(12000))
      await refresh()
    } catch (error) { setIssue(error instanceof Error ? error.message : '删除结果尚未确认，请刷新后重试。') }
    finally { setBusy(false) }
  }
  return <div className="lumaDeleteWork">
    {confirm ? <><span>删除这项本机工作、原文及插件生成的交付文件？角色画像会保留。</span>
      <button type="button" disabled={busy} onClick={()=>void remove()}>{busy?'正在删除…':'确认删除'}</button>
      <button type="button" disabled={busy} onClick={()=>{setConfirm(false); setIssue('')}}>返回</button></>
      : <button type="button" onClick={()=>setConfirm(true)}>删除工作记录</button>}
    {issue && <small role="alert">{issue}</small>}
  </div>
}
