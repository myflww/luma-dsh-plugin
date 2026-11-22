import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

type Section = Record<string, unknown>
type Namespace = { ns: string; revision: number; user: Section; base: Section; effective: Section; secrets: string[] }
type Description = { writable: boolean; namespaces: Namespace[] }
type ScopeSpec<T> = { namespace: string; decode?: (section: unknown) => T | undefined }

/** The same revision guards user edits, card spending and backup restore. */
export function createDesktopSettings(fetcher = fetch) {
  const views = new Map<string, Namespace>()
  const externalVersions = new Map<string, number>()
  const listeners = new Set<() => void>()
  const abort = new AbortController()
  const queues = new Map<string, Promise<void>>()
  let status: 'loading' | 'ready' | 'unavailable' = 'loading'
  let writable = false
  let pendingRead: Promise<Description> | undefined
  function emit() { for (const listener of listeners) listener() }
  function accept(view: Namespace, fromRead = false) {
    if (abort.signal.aborted || view.revision <= (views.get(view.ns)?.revision ?? -1)) return
    if (fromRead) externalVersions.set(view.ns, (externalVersions.get(view.ns) ?? 0) + 1)
    views.set(view.ns, view)
  }
  async function request<T>(payload: object): Promise<T> {
    const response = await fetcher('/luma-native/settings', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: abort.signal })
    const envelope = await response.json()
    if (!response.ok || envelope.ok !== true)
      throw Object.assign(new Error(envelope.error ?? '无法访问本机 Luma 设置。'), { code: envelope.code ?? 'settings-unavailable' })
    return envelope.value as T
  }
  function describe(): Promise<Description> {
    if (pendingRead) return pendingRead
    pendingRead = request<Description>({ action: 'describe' }).then(value => {
      for (const view of value.namespaces) accept(view, true)
      writable = value.writable
      status = 'ready'
      emit()
      return value
    }).catch(error => {
      writable = false
      status = 'unavailable'
      emit()
      throw error
    }).finally(() => { pendingRead = undefined })
    return pendingRead
  }
  async function replace(input: { ns: string; section: Section; expectedRevision: number }, restore = false) {
    try {
      const view = await request<Namespace>({ action: 'update', ...input, ...(restore ? { restore: true } : {}) })
      accept(view)
      emit()
      return view
    } catch (error) {
      // A disconnected client may have committed. Re-read before another edit.
      if (!abort.signal.aborted) {
        await pendingRead?.catch(() => {})
        await describe().catch(() => {})
      }
      throw error
    }
  }
  async function asEnvelope<T>(call: () => Promise<T>) {
    try { return { result: { ok: true, value: await call() } } }
    catch (error) {
      return { result: { ok: false, error: { message: String(error), code: (error as {code?:string})?.code ?? 'settings-unavailable' } } }
    }
  }
  function bind<T>({ namespace, decode }: ScopeSpec<T>): SettingsScope<T> {
    const snapshot = (): SettingsScopeSnapshot<T> => {
      const view = views.get(namespace)
      const value = view && (decode ? decode(view.effective) : view.effective as T)
      return { status: status === 'ready' && (!view || value === undefined) ? 'unavailable' : status,
        writable: writable && !!view && value !== undefined, mode: 'host', value,
        base: view?.base, user: view?.user, revision: view?.revision }
    }
    let cached = snapshot()
    let previousView = views.get(namespace)
    let previousStatus = status
    let previousWritable = writable
    function getSnapshot() {
      if (previousView !== views.get(namespace) || previousStatus !== status || previousWritable !== writable) {
        const next = snapshot()
        if (previousView !== views.get(namespace) || cached.status !== next.status || cached.writable !== next.writable) cached = next
        previousView = views.get(namespace)
        previousStatus = status
        previousWritable = writable
      }
      return cached
    }
    function edit(field: string, value: unknown) {
      const observed = externalVersions.get(namespace)
      const previous = queues.get(namespace) ?? Promise.resolve()
      const next = previous.catch(() => {}).then(async () => {
        const view = views.get(namespace)
        if (!getSnapshot().writable || !view) throw Error('本机设置还未就绪。')
        if (externalVersions.get(namespace) !== observed)
          throw Object.assign(new Error('设置已在其他窗口修改，请重试。'), {code:'settings-conflict'})
        const section = { ...view.user }
        if (value === undefined) delete section[field]
        else section[field] = value
        await replace({ ns: namespace, section, expectedRevision: view.revision })
      })
      queues.set(namespace, next)
      return next
    }
    return { getSnapshot, subscribe(listener) {
      let observed = getSnapshot()
      const notify = () => {
        const next = getSnapshot()
        if (next === observed) return
        observed = next
        listener()
      }
      listeners.add(notify)
      return () => { listeners.delete(notify) }
    },
      set: edit, unset: field => edit(field, undefined) }
  }
  const refresh = () => { void describe().catch(() => {}) }
  refresh()
  // A reopened panel or a restored connection sees writes from another window.
  globalThis.window?.addEventListener('focus', refresh)
  const timer = setInterval(() => { if (globalThis.document?.visibilityState === 'visible') refresh() }, 15_000)
  return { bind, api: { describe: () => asEnvelope(describe),
      replace: (input: Parameters<typeof replace>[0]) => asEnvelope(() => replace(input, true)) },
    dispose() { clearInterval(timer); globalThis.window?.removeEventListener('focus', refresh); listeners.clear(); abort.abort() } }
}
