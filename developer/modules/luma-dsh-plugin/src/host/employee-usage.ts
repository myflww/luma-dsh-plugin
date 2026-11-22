import { isAbsolute, normalize, relative } from 'node:path'
import { realpathSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { OFFICE_EMPLOYEE_KEYS, OFFICE_EMPLOYEE_PRESET_IDS, isOfficeEmployeeKey } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-employee-presets.ts'

export const TOKEN_REWARD_THRESHOLD = 1_000_000
const roleFor = (preset: unknown) => OFFICE_EMPLOYEE_KEYS.find(id => OFFICE_EMPLOYEE_PRESET_IDS[id] === preset)
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
type Fields = Record<string, unknown>
const object = (v: unknown): Fields => typeof v === 'object' && v !== null ? v as Fields : {}
function sum(...values: unknown[]): number | undefined {
  if (!values.every(count)) return
  const total = values.reduce((n, v) => n + v, 0)
  return count(total) ? total : undefined
}
/** Same four disjoint buckets as the desktop tokenUsage projection. Reasoning is already included in output. */
export function dshUsageTotal(value: unknown) {
  const v = object(value)
  return sum(v.inputTokens, v.outputTokens, v.cacheReadTokens ?? 0, v.cacheWriteTokens ?? 0)
}
export function providerUsageTotal(protocol: string, data: Fields) {
  const v = object(protocol === 'gemini' ? data.usageMetadata : data.usage)
  if (protocol === 'anthropic') return sum(v.input_tokens, v.output_tokens, v.cache_read_input_tokens ?? 0, v.cache_creation_input_tokens ?? 0)
  if (protocol === 'gemini') return count(v.totalTokenCount) ? v.totalTokenCount : undefined
  return count(v.total_tokens) ? v.total_tokens : sum(v.prompt_tokens, v.completion_tokens)
}
type SessionHeader = {id:string; cwd?:string; agentPreset?:string; isSeeded?:boolean}
type UsageEvent = {type:string; data?:unknown}
type SessionObservation = {session:SessionHeader; inheritedEventCount?:number; events:readonly UsageEvent[]}
export type LiveUsageSession = {id:string; seq:number; firstLifecycleSeq?:number; header:SessionHeader; inheritedEventCount?:number; snapshotEvents():readonly UsageEvent[]}
export interface UsageQuery {
  listSessions?(): Promise<readonly {header:SessionHeader; live:boolean}[]>
  readSession(id:string): Promise<SessionObservation>
}
function eventTokens(event: UsageEvent) {
  const data = object(event.data)
  if (event.type === 'assistant/message' && data.usage !== undefined) return dshUsageTotal(data.usage)
  if (!Array.isArray(data.stream)) return
  const record = data.stream.findLast(row => row?.type === 'chunk' && row.chunk?.type === 'usage')
  return dshUsageTotal(record?.chunk?.usage)
}
/** A retry opens a new billable attempt. Repeated samples for the same step replace its last sample. */
export function sessionRoleTokens({session, events, inheritedEventCount = 0}: SessionObservation) {
  const totals = new Map<string, number>()
  let role = roleFor(session.agentPreset)
  let last: {turn: number; step: number; tokens: number; role:typeof role} | undefined
  for (const [index,event] of events.entries()) {
    const data = object(event.data)
    if (event.type === 'agent-preset/selected') { role = roleFor(data.agentPreset); continue }
    if (index < inheritedEventCount || !count(data.turn) || !count(data.step)) continue
    const same: boolean = !!last && last.turn === data.turn && last.step === data.step
    if (event.type === 'llm/retry-started') { if (same) last = undefined; continue }
    if (event.type !== 'assistant/attempt' && event.type !== 'assistant/message') continue
    const tokens = eventTokens(event)
    if (tokens === undefined) continue
    const owner: typeof role = same && last ? last.role : role
    if (owner) totals.set(owner, (totals.get(owner) ?? 0) + tokens - (same && last ? last.tokens : 0))
    last = {turn:data.turn, step:data.step, tokens, role:owner}
  }
  return totals
}
export type EmployeeUsage = ReturnType<typeof createEmployeeUsage>
export function createEmployeeUsage(db: DatabaseSync, query: UsageQuery, homes: Record<string,string>) {
  db.exec(`CREATE TABLE IF NOT EXISTS employee_usage_native(session TEXT NOT NULL, role TEXT NOT NULL, tokens INTEGER NOT NULL, PRIMARY KEY(session,role));
    CREATE TABLE IF NOT EXISTS employee_usage_requests(role TEXT NOT NULL, request TEXT NOT NULL, tokens INTEGER NOT NULL, PRIMARY KEY(role,request));
    CREATE TABLE IF NOT EXISTS employee_usage_owned_sessions(session TEXT PRIMARY KEY, relevant INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS employee_usage_revision(session TEXT PRIMARY KEY, events INTEGER NOT NULL);`)
  const enroll = db.prepare('INSERT OR IGNORE INTO employee_usage_owned_sessions VALUES (?,?)')
  const markRole = db.prepare('UPDATE employee_usage_owned_sessions SET relevant=1 WHERE session=?')
  const owns = db.prepare('SELECT 1 FROM employee_usage_owned_sessions WHERE session=? AND relevant=1')
  const revision = db.prepare('SELECT events FROM employee_usage_revision WHERE session=?')
  const updateRevision = db.prepare('INSERT INTO employee_usage_revision VALUES(?,?) ON CONFLICT(session) DO UPDATE SET events=excluded.events WHERE excluded.events>employee_usage_revision.events')
  const saveNative = db.prepare('INSERT INTO employee_usage_native VALUES(?,?,?)')
  const clearNative = db.prepare('DELETE FROM employee_usage_native WHERE session=?')
  const saveRequest = db.prepare('INSERT INTO employee_usage_requests VALUES(?,?,?) ON CONFLICT(role,request) DO UPDATE SET tokens=excluded.tokens')
  const totals = db.prepare(`SELECT role, SUM(tokens) AS total FROM (SELECT role,tokens FROM employee_usage_native UNION ALL SELECT role,tokens FROM employee_usage_requests) GROUP BY role`)
  const localHomes = Object.values(homes)
  const canonicalHomes = new Set(localHomes.map(path => {try { return realpathSync.native(path) } catch { return path }}))
  const aliases = new Map<string,boolean>()
  const employeeDirectory = /(?:^|[\\/])luma-plugin[\\/]characters[\\/][^\\/]+$/i
  const cold = new Set<string>()
  let stopped = false, pending: Promise<void> | undefined
  let lastRefresh = 0, complete = false, generation = 0
  let finalSnapshot: ReturnType<typeof readSnapshot> | undefined
  function local(header: SessionHeader) {
    const cwd = header.cwd
    if (!cwd || !isAbsolute(cwd)) return false
    if (localHomes.some(home => relative(home, cwd) === '')) return true
    if (!employeeDirectory.test(normalize(cwd)) || cwd.startsWith('\\\\')) return false
    if (!aliases.has(cwd)) {
      try { aliases.set(cwd, canonicalHomes.has(realpathSync.native(cwd))) } catch { aliases.set(cwd, false) }
    }
    return aliases.get(cwd)!
  }
  function foreign(header: SessionHeader) {
    return !!header.cwd && /(?:^|[\\/])luma-plugin[\\/]characters[\\/][^\\/]+(?:[\\/]|$)/i.test(normalize(header.cwd)) && !local(header)
  }
  function readSnapshot() {
    const records = new Map(totals.all().map(row => [String(row.role), Number(row.total)]))
    const roles = Object.fromEntries(OFFICE_EMPLOYEE_KEYS.map(id => {
      const totalTokens = records.get(id) ?? 0
      return [id,{totalTokens, earnedCoins:Math.floor(totalTokens/TOKEN_REWARD_THRESHOLD), remainderTokens:totalTokens%TOKEN_REWARD_THRESHOLD}]
    }))
    return {threshold:TOKEN_REWARD_THRESHOLD, roles, nativeHistoryComplete:complete}
  }
  const snapshot = () => finalSnapshot ?? readSnapshot()
  function saveObservation(observation:SessionObservation) {
    if (observation.session.isSeeded && !count(observation.inheritedEventCount)) throw Error('无法核验派生会话的继承边界。')
    // Cold reads may append synthetic closing events. Only a durable Assistant settlement advances this cursor.
    const id=observation.session.id, length=1 + observation.events.findLastIndex(event => event.type === 'assistant/message' || event.type === 'assistant/attempt')
    if (Number(revision.get(id)?.events ?? -1) >= length) return
    const amounts = sessionRoleTokens(observation)
    db.exec('SAVEPOINT luma_usage_session')
    try {
      if (updateRevision.run(id,length).changes) {
        clearNative.run(id)
        for (const [role,tokens] of amounts) saveNative.run(id,role,tokens)
      }
      db.exec('RELEASE luma_usage_session')
    } catch (e) { db.exec('ROLLBACK TO luma_usage_session; RELEASE luma_usage_session'); throw e }
  }
  async function refresh() {
    if (!query.listSessions) { complete = false; return }
    const version = generation
    let success = true
    const sessions = await query.listSessions()
    for (const {header,live} of sessions) {
      if (stopped) return
      if (foreign(header) || (!local(header) && !owns.get(header.id)) || (!live && cold.has(header.id))) continue
      try {
        const observation = await query.readSession(header.id)
        if (stopped) return
        if (observation.session.id !== header.id || observation.session.cwd !== header.cwd || foreign(observation.session)) { success = false; continue }
        saveObservation(observation)
        if (!live && generation === version) cold.add(header.id)
      } catch { success = false }
    }
    complete = success
    if (generation === version) lastRefresh = Date.now()
  }
  return {
    snapshot,
    async progress() {
      if (!stopped && (!lastRefresh || Date.now()-lastRefresh > 5000)) {
        pending ??= refresh().catch(() => {complete = false}).finally(() => {pending = undefined})
        await pending
      }
      return snapshot()
    },
    /** Fresh Session announcements belong to this profile. Restoring a shared historical session is not a creation claim. */
    created(header: SessionHeader, firstOwnedSeq: number, inherited = 0) {
      if (!stopped && firstOwnedSeq === inherited && !foreign(header)) enroll.run(header.id, Number(!!roleFor(header.agentPreset)))
    },
    changed(session:LiveUsageSession, event:UsageEvent) {
      if (stopped || foreign(session.header)) return
      if (event.type === 'agent-preset/selected' && roleFor(object(event.data).agentPreset)) markRole.run(session.id)
      if ((event.type !== 'assistant/message' && event.type !== 'assistant/attempt') || (!local(session.header) && !owns.get(session.id))) return
      cold.delete(session.id); generation++; lastRefresh = 0
      try {
        saveObservation({session:session.header, inheritedEventCount:session.inheritedEventCount ?? 0, events:session.snapshotEvents()})
      } catch { complete = false }
    },
    recordModelUsage(role:string, request:string, tokens:number) {
      if (!stopped && isOfficeEmployeeKey(role) && request && count(tokens)) saveRequest.run(role,request,tokens)
    },
    dispose() { if (!stopped) { finalSnapshot = snapshot(); stopped = true } },
  }
}
