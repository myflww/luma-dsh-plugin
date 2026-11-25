import { useCallback, useEffect, useRef, useState } from 'react'

interface PetStatus { supported: boolean; pets: { roleId: string }[] }
type Action = 'status' | 'open' | 'recall'
const empty: readonly string[] = []

async function request(action: Action, signal: AbortSignal, roleId?: string, atCursor = false, reduceMotion = false): Promise<PetStatus> {
  const reply = await fetch('/luma-native/desktop-pet', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, roleId, atCursor, reduceMotion }),
  })
  const data = await reply.json()
  if (!reply.ok || !data.ok || !Array.isArray(data.value?.pets)) throw Error(data.error || '桌宠服务连接失败，请重试。')
  return data.value
}

export function useDesktopPets(enabled: boolean, notify: (message: string) => void, reduced: () => boolean) {
  const [available, setAvailable] = useState(false)
  const [roleIds, setRoleIds] = useState(empty)
  const session = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const changes = useRef(Promise.resolve())
  const pending = useRef(new Set<string>())
  const accept = useCallback((result: PetStatus) => {
    setAvailable(result.supported)
    const next = result.pets.map(p => p.roleId)
    setRoleIds(previous => next.length === previous.length && next.every((id, index) => previous[index] === id) ? previous : next)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    session.current = controller
    let timer: ReturnType<typeof setTimeout>
    let checking = false
    let hasPets = false
    async function refresh() {
      if (checking || controller.signal.aborted) return
      clearTimeout(timer)
      checking = true
      const revision = sequence.current
      try {
        if (!document.hidden && !pending.current.size) {
          const result = await request('status', controller.signal, undefined, false, reduced() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
          if (!controller.signal.aborted && revision === sequence.current) {
            accept(result)
            hasPets = result.pets.length > 0
          }
        }
      } catch { /* A host restart is transient. Keep the last known scene ownership. */ }
      finally {
        checking = false
        if (!controller.signal.aborted) timer = setTimeout(refresh, hasPets ? 1800 : 4500)
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      clearTimeout(timer)
      session.current = null
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled, accept, reduced])

  const change = useCallback(async (action: 'open' | 'recall', roleId: string, atCursor = false) => {
    const controller = session.current
    if (!controller || pending.current.has(roleId)) return
    pending.current.add(roleId)
    ++sequence.current
    changes.current=changes.current.then(async()=>{
      try {
        if(controller.signal.aborted)return
        const result = await request(action, controller.signal, roleId, atCursor, reduced() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
        if (!controller.signal.aborted) {accept(result);notify('')}
      } catch (error) {
        if (!controller.signal.aborted) notify(error instanceof Error ? error.message : '无法连接桌宠，请重试。')
      } finally { pending.current.delete(roleId) }
    })
    await changes.current
  }, [accept, notify, reduced])
  const open = useCallback((role: string, point?: {screenX: number; screenY: number}) => { void change('open', role, !!point) }, [change])
  const recall = useCallback((role: string) => { void change('recall', role) }, [change])
  return { roleIds:enabled?roleIds:empty, open: enabled && available ? open : undefined, recall: enabled && available ? recall : undefined }
}
