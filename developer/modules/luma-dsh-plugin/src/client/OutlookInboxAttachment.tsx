import { useEffect, useId, useRef, useState } from 'react'
import { agentRequest } from './agent-desk-api.ts'
import { outlookDate, outlookDraft, type OutlookHeader, type OutlookPreview } from '../shared/outlook-inbox.ts'
import './OutlookInboxAttachment.css'

interface Props {
  roleId: string
  recipient?: string
  disabled?: boolean
  onAttach(text: string): void
  onClose?(): void
}

export function OutlookInboxAttachment({roleId, recipient, disabled, onAttach, onClose}: Props) {
  const [rows,setRows] = useState<OutlookHeader[]>()
  const [selected,setSelected] = useState<number[]>([])
  const [reading,setReading] = useState(false)
  const [error,setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const title = useId()
  useEffect(() => {
    setRows(undefined); setSelected([]); setReading(false); setError('')
    return () => { controller.current?.abort(); controller.current = null }
  },[roleId])
  async function read() {
    if (controller.current || disabled) return
    const request = new AbortController()
    controller.current = request
    setReading(true); setError(''); setRows(undefined); setSelected([])
    try {
      const result = await agentRequest<OutlookPreview>('outlookinbox',{roleId},AbortSignal.any([request.signal,AbortSignal.timeout(16000)]))
      if (!request.signal.aborted) setRows(result.headers)
    } catch (e) {
      if (!request.signal.aborted) setError(e instanceof Error ? e.message : '读取邮件摘要失败。')
    } finally {
      if (controller.current === request) { controller.current = null; setReading(false) }
    }
  }
  return <section className="lumaOutlookInbox" aria-labelledby={title}>
    <header><strong id={title}>经典 Outlook 收件箱</strong>
      {onClose && <button type="button" aria-label="关闭邮件预览" onClick={onClose}>关闭</button>}</header>
    <p>读取默认收件箱最近 20 封邮件的主题、发件人、时间和已读状态。勾选后可加入{recipient ? recipient+'的' : '当前'}私聊草稿。</p>
    <button type="button" disabled={disabled || reading} onClick={()=>void read()}>{reading ? '正在读取…' : rows || error ? '重新读取' : '读取最近 20 封'}</button>
    {error && <p role="alert">{error}</p>}
    {rows && (rows.length ? <><ul aria-label="邮件摘要">{rows.map((row,index)=><li key={index}>
      <label><input type="checkbox" checked={selected.includes(index)} disabled={disabled} onChange={e=>{
        const checked = e.currentTarget.checked
        setSelected(current=>checked ? [...current,index] : current.filter(id=>id!==index))
      }}/><span><strong>{row.subject || '（无主题）'}</strong>
        <small>{row.sender || '未知发件人'} · {outlookDate(row.received)} · {row.unread ? '未读' : '已读'}</small></span></label>
    </li>)}</ul><button type="button" disabled={disabled || selected.length===0} onClick={()=>{
      try {
        onAttach(outlookDraft(rows.filter((_,index)=>selected.includes(index))))
        setRows(undefined); setSelected([]); onClose?.()
      } catch (e) { setError(e instanceof Error ? e.message : '添加邮件摘要失败。') }
    }}>将所选摘要加入草稿{selected.length ? '（'+selected.length+'）' : ''}</button></> : <p role="status">收件箱中没有邮件。</p>)}
  </section>
}
