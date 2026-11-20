import { useEffect, useState } from 'react'
export function useAgentWorkRoles(active: boolean): readonly string[] {
  const [roles, setRoles] = useState<readonly string[]>([])
  useEffect(() => {
    if (!active) return
    let closed = false
    let timer: ReturnType<typeof setTimeout>
    const abort = new AbortController()
    async function update() {
      try {
        if (document.visibilityState !== 'hidden') {
          const res = await fetch('/luma-agents/activity', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
            signal: abort.signal,
          })
          const payload = await res.json()
          if (!closed) {
            const current: string[] = res.ok && payload.ok && Array.isArray(payload.value?.roleIds)
              ? payload.value.roleIds.filter((id:unknown) => typeof id === 'string') : []
            setRoles(prev => prev.join(',') === current.join(',') ? prev : current)
          }
        }
      } catch {
        if (!closed) setRoles((prev) => (prev.length ? [] : prev))
      } finally {
        if (!closed) timer = setTimeout(update, 1800)
      }
    }
    void update()
    return () => {
      closed = true
      clearTimeout(timer)
      abort.abort()
    }
  }, [active])
  return roles
}
