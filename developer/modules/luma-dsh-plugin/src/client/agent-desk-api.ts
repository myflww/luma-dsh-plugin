import type { AttachmentInfo } from '../shared/chat-attachments.ts'
import type { LifeLetter } from '../shared/companion-life.ts'
import type { PeerRequest, StudioPhase, TeamWorkflow } from '../shared/studio-workflow.ts'
import type { StudioReceipt, StudioReview } from '../shared/studio-verification.ts'
import { useCallback, useEffect, useRef, useState } from 'react'

export type AgentMode = 'chat' | 'task' | 'team'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export interface AgentJob {
  id: string
  roleIds: string[]
  mode: AgentMode
  topic?: string
  text: string
  attachments?: AttachmentInfo[]
  status: JobStatus
  steps: { roleId: string; model?:string; status: JobStatus; output: string; phase?: StudioPhase; activity?: string; handoff?:PeerRequest;desktopReceipt?:StudioReceipt;desktopReview?:StudioReview[];reviewedReceiptIds?:string[] }[]
  workflow?: TeamWorkflow
  roomRequired?: number
  reviewerId?:string
  desktopTargets?: Record<string,string>
  error?: string
  createdAt: number
}
export interface AgentConfig {
  protocol?: 'openai' | 'anthropic' | 'gemini'; source?:'dsh'|'custom'|'local'; provider?:string; effort?:string
  baseUrl: string; model: string; hasKey: boolean
}
export interface WorkRoom { duties?:Record<string,string>; workflow?: TeamWorkflow; id: string; name: string; roleIds: string[]; createdAt: number }
export interface AgentState {
  petFileDefault?: boolean
  roles: Record<string, AgentConfig>
  jobs: AgentJob[]
  rooms?: WorkRoom[]
  letters?: LifeLetter[]
  loveHouse: { available: boolean; connected: boolean; pending?: number; message?: string; portableAvailable?: boolean; reusedPortable?: boolean; localRecallRoles?: readonly string[] }
  previews?: Record<string, {text: string; time: number}>
  memories: Record<string, number>
}
export interface AgentMemory { id: string; text: string; createdAt: number; reflection?:{thought:string;evidence:string} }
type CloudAction = 'cloudstate' | 'cloudconfigure' | 'cloudprobe' | 'cloudsubmit' | 'cloudrefresh' | 'cloudretry' | 'cloudresult' | 'cloudcancel'
type ModelAction = 'providers' | 'localproviders' | 'models' | 'reasoning' | 'discover' | 'configure'
type WorkAction = 'deletejob' | 'desktopstatus' | 'desktoptargets' | 'desktoppreview' | 'readwindowtask' | 'outlookinbox'
type RecordAction = 'archiverecord' | 'restorerecord' | 'deleterecord' | 'archivedrecords' | 'readrecord'
type Action = 'state' | ModelAction | 'run' | 'cancel' | 'connect' | 'housestatus' | 'houseconnect' | 'memory' | 'remember' | 'record' | 'recall' | 'createroom' | 'renameroom' | 'companionsettings' | 'companionconfigure' | 'companionpulse' | 'forgetstyle' | CloudAction
type PortraitAction = 'portrait' | 'portraitedit' | 'portraitforget' | 'portraitconfigure'
export async function agentRequest<T>(action: Action | WorkAction | PortraitAction | RecordAction | 'speechstatus' | 'readspeech' | 'stopspeech', data: object = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/luma-agents/' + action, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), ...(signal ? { signal } : {}),
  })
  const envelope = await response.json().catch(() => undefined)
  if (response.ok && envelope?.ok === true) return envelope.value as T
  throw Error(typeof envelope?.error === 'string' ? envelope.error : '员工服务暂时无法连接。')
}
export const inProgress = (status: JobStatus) => status === 'queued' || status === 'running'

/** The Host owns execution independently of the visible page. Read only on
 * screen, and discard older responses that finish after a newer refresh. */
export function useAgentDesk(active: boolean) {
  const [state, setState] = useState<AgentState>()
  const [problem, setProblem] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current
    try {
      const timeout = AbortSignal.timeout(12_000)
      const next = await agentRequest<AgentState>('state', {}, signal ? AbortSignal.any([signal, timeout]) : timeout)
      if (current === generation.current && !signal?.aborted) { setState(next); setProblem('') }
      return next
    } catch (error) {
      if (current === generation.current && !signal?.aborted) {
        setProblem(error instanceof Error && error.name === 'TimeoutError' ? '员工服务未及时响应。'
          : error instanceof Error && !(error instanceof TypeError) ? error.message : '员工服务暂时无法连接。')
      }
      return undefined
    }
  }, [])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let polling = false
    async function poll() {
      if (document.hidden || controller.signal.aborted || polling) return
      polling = true
      const next = await refresh(controller.signal)
      polling = false
      if (!controller.signal.aborted && !document.hidden) {
        timer = setTimeout(() => void poll(), next?.jobs.some(job => inProgress(job.status)) ? 1200 : 6500)
      }
    }
    const visibility = () => { clearTimeout(timer); if (!document.hidden) void poll() }
    void poll()
    document.addEventListener('visibilitychange', visibility)
    return () => { controller.abort(); ++generation.current; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [active, refresh])
  return { state, problem, refresh }
}
