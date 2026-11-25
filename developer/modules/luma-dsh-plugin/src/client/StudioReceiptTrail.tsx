import { ArrowRight, CheckCheck, ChevronDown, CircleDashed, ClipboardCheck, Monitor, ReceiptText, TriangleAlert } from 'lucide-react'
import type { AgentJob } from './agent-desk-api.ts'
import './StudioReceiptTrail.css'

const actionNames:Record<string,string> = {
  'set-value':'填写',click:'点击',toggle:'切换',check:'勾选',uncheck:'取消勾选',expand:'展开',collapse:'收起',
}
export function StudioReceiptTrail({job,names}:{job:AgentJob;names:Record<string,string>}) {
  if (job.workflow!=='studio'||!job.reviewerId)return null
  const operators=job.steps.filter(s=>s.phase==='work' && job.desktopTargets?.[s.roleId])
  if(!operators.length)return null
  const verifier=job.steps.find(s=>s.phase==='verify'&&s.roleId===job.reviewerId)
  const final=job.steps.find(s=>s.phase==='review')
  const received=operators.filter(s=>s.desktopReceipt).length
  const reviewed=verifier?.desktopReview ?? []
  const delivered=final?.reviewedReceiptIds ?? []
  const full=received===operators.length && operators.every(s=>s.desktopReceipt&&delivered.includes(s.desktopReceipt.id))
  const forwarded=final?.status==='done' && full
  const who=(id:string)=>names[id]||id
  return <details className="lumaReceiptTrail">
    <summary aria-label={'窗口回执，已收到 '+received+' / '+operators.length+' 份'}>
      <span className="lumaReceiptSigil"><ReceiptText size={17}/></span>
      <strong>窗口回执</strong><span className="lumaReceiptCount">{received} / {operators.length}</span>
      <span className="lumaReceiptRoute"><ClipboardCheck size={14}/>{who(job.reviewerId)}<ArrowRight size={12}/>{who(job.roleIds[0]!)}</span>
      <ChevronDown size={15} className="lumaReceiptChevron"/>
    </summary>
    <ol>{operators.map(s=>{
      const receipt=s.desktopReceipt, check=receipt && reviewed.find(r=>r.roleId===s.roleId&&r.receiptId===receipt.id)
      const result=check?.verdict
      const label=result==='pass'?'复核通过':result==='fail'?'复核未通过':result==='unconfirmed'?'复核待确认':
        receipt?.status==='failed' || s.status==='failed'?'执行失败':receipt?.status==='unconfirmed'?'回读待确认':receipt?'已回读':s.status==='cancelled'?'已停止':'等候回执'
      const Icon=result==='pass'?CheckCheck:result==='fail'||s.status==='failed'?TriangleAlert:CircleDashed
      return <li key={s.roleId}><header><Monitor size={15}/><b>{who(s.roleId)}</b>
        <span className="lumaReceiptWindow" title={receipt?.title}>{receipt?.title}</span>
        <small data-tone={result ?? receipt?.status}><Icon size={13}/>{label}</small></header>
        {receipt&&<div className="lumaReceiptBody">
          {receipt.actions.length>0&&<ul aria-label="窗口操作">{receipt.actions.map((a,i)=><li key={i}>{actionNames[a.action]??a.action} · {a.control}{a.input!==undefined&&<code>{a.input}</code>}</li>)}</ul>}
          {receipt.readbacks.length>0&&<dl>{receipt.readbacks.map((r,i)=><div key={i}><dt>{r.control||'回读'}</dt><dd>{r.text}</dd></div>)}</dl>}
          {check?.note&&<p>{check.note}</p>}
          <code className="lumaReceiptId" title={receipt.id}>{receipt.id}</code>
        </div>}</li>
    })}</ol>
    {forwarded&&<footer><CheckCheck size={14}/>复核已交给{who(job.roleIds[0]!)}</footer>}
  </details>
}
