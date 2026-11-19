import { useEffect, useRef, useState } from 'react'
import { isIndependentSpaceId, loadIndependentSpace } from './generatedIndependentSpaceLoaders.ts'
import type { IndependentOfficeSpace } from './generatedIndependentSpaceTypes.ts'
import { withCompletedWorkMotion } from './completedWorkMotion.ts'
import { withBrowserOfficeNavigation } from './browserOfficeNavigation.ts'

export type IndependentOfficeSpaceLoader = (theme: string) => Promise<IndependentOfficeSpace>
export type IndependentOfficeSpaceRead =
  | { readonly theme: string; readonly status: 'loading' | 'error' }
  | { readonly theme: string; readonly status: 'ready'; readonly space: IndependentOfficeSpace }

/** Read only the requested office module; bedroom and unknown IDs are errors. */
export const loadIndependentOfficeSpace: IndependentOfficeSpaceLoader = async theme => {
  if (!isIndependentSpaceId(theme) || !theme.startsWith('office.')) throw new Error('Unknown independent office')
  const space = await loadIndependentSpace(theme)
  if (space.layout.kind !== 'office' || space.layout.theme !== theme) throw new Error('Independent office identity mismatch')
  return withBrowserOfficeNavigation(withCompletedWorkMotion(space as IndependentOfficeSpace))
}

/** Module imports cannot be aborted. Cleanup discards obsolete presentation only. */
export function useIndependentOfficeSpace(
  theme: string | undefined,
  active = true,
  loader: IndependentOfficeSpaceLoader = loadIndependentOfficeSpace,
): IndependentOfficeSpaceRead {
  const key = theme ?? ''
  const [read, setRead] = useState<IndependentOfficeSpaceRead>({ theme: key, status: 'loading' })
  const ready = useRef<Extract<IndependentOfficeSpaceRead, { status: 'ready' }> | null>(null)
  useEffect(() => {
    if (!active) return
    const cached = ready.current
    if (cached?.theme === key) { setRead(cached); return }
    let current = true
    setRead({ theme: key, status: 'loading' })
    void Promise.resolve().then(() => loader(key)).then(space => {
      if (!current) return
      const next = { theme: key, status: 'ready', space } as const
      ready.current = next
      setRead(next)
    }, () => {
      if (current) setRead({ theme: key, status: 'error' })
    })
    return () => { current = false }
  }, [key, active, loader])
  // Never expose the preceding theme while the new effect is being scheduled.
  return read.theme === key ? read : { theme: key, status: 'loading' }
}
