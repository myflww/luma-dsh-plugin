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
          if (!closed && payload.ok && Array.isArray(payload.value?.roleIds))
            setRoles((prev) =>
              prev.join(',') === payload.value.roleIds.join(',') ? prev : payload.value.roleIds,
            )
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
