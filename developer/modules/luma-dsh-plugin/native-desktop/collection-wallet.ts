import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { DatabaseSync } from 'node:sqlite'
import { LOCAL_COLLECTION_SETTINGS_NAMESPACE as namespace } from '../src/local-collection-settings.ts'
import { CHARACTER_NAMES, projectLocalCollectionSettings, type CharacterId, type LocalCollectionEvent, type LocalCollectionSettings } from '../src/shared/local-collection-domain.ts'
import type { EmployeeUsage } from '../src/host/employee-usage.ts'

/** All reads, authority checks, receipts and the versioned wallet write share one SQLite transaction. */
export function createCollectionWallet(db: DatabaseSync, usage: Pick<EmployeeUsage, 'snapshot'>) {
  db.exec(`CREATE TABLE IF NOT EXISTS wallet_receipts (
    kind TEXT NOT NULL, source TEXT NOT NULL, amount INTEGER NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL,
    PRIMARY KEY(kind,source,amount))`)
  const read = db.prepare('SELECT revision,value FROM sections WHERE ns=?')
  const write = db.prepare('UPDATE sections SET revision=revision+1,value=? WHERE ns=? AND revision=?')
  const previousAwards = db.prepare("SELECT source,MAX(amount) AS coins FROM wallet_receipts WHERE kind='token-reward' GROUP BY source")
  const readReceipt = db.prepare('SELECT id,at FROM wallet_receipts WHERE kind=? AND source=? AND amount=?')
  const addReceipt = db.prepare('INSERT INTO wallet_receipts VALUES(?,?,?,?,?)')
  const roles = Object.keys(CHARACTER_NAMES) as CharacterId[]
  function receipt(kind: string, source: string, amount: number) {
    const row = readReceipt.get(kind,source,amount)
    if (row) return {id:String(row.id), at:Number(row.at)}
    const id = randomUUID(), at = Date.now()
    addReceipt.run(kind,source,amount,id,at)
    return {id,at}
  }
  // Repeated describes can reuse a previously reconciled revision, including after unrelated settings writes.
  let cached: {revision: number; earned: string} | undefined
  function reconcile(replacement?: {section: LocalCollectionSettings; expectedRevision: number; restore?: boolean}) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const row = read.get(namespace)!
      let revision = Number(row.revision)
      if (replacement && replacement.expectedRevision !== revision) {
        db.exec('ROLLBACK')
        return {revision, conflict:true}
      }
      const current = usage.snapshot().roles
      const earned = JSON.stringify(roles.map(role => current[role].earnedCoins))
      if (!replacement && cached?.revision === revision && cached.earned === earned) {
        db.exec('COMMIT')
        return {revision, conflict:false}
      }
      const section: LocalCollectionSettings = replacement?.section ?? JSON.parse(String(row.value))
      const projected = projectLocalCollectionSettings(section)
      if (replacement && !replacement.restore) {
        const previous: LocalCollectionSettings = JSON.parse(String(row.value))
        const prefix = previous.state?.events ?? [], incoming = section.state?.events ?? []
        if (incoming.length < prefix.length || !prefix.every((event, i) => isDeepStrictEqual(event, incoming[i])))
          throw Error('现有钱包流水只能通过备份还原。')
        if (incoming.slice(prefix.length).some(event => ['token-reward','album-skin-refund','buy-album-skin'].includes(event.type)))
          throw Error('自动结算和历史装帧交易不能由客户端追加。')
      }
      const historical = new Map(previousAwards.all().map(r => [String(r.source), Number(r.coins)]))
      const additions: LocalCollectionEvent[] = []
      for (const employeeId of roles) {
        const paid = projected.tokenRewardCoins[employeeId] ?? 0
        const prior = historical.get(employeeId) ?? 0
        const authorized = Math.max(current[employeeId].earnedCoins, prior)
        if (paid > authorized) throw Error('该档案的员工用量不足以核验奖励。')
        if (authorized > paid || authorized > prior) {
          const entry = receipt('token-reward',employeeId,authorized)
          if (authorized > paid) additions.push({...entry,type:'token-reward',employeeId,throughCoins:authorized})
        }
      }
      for (const purchase of projected.purchases) {
        if (purchase.kind !== 'album-skin' || projected.refundedAlbumPurchaseIds.includes(purchase.id)) continue
        const entry = receipt('album-skin-refund',purchase.id,purchase.price)
        additions.push({...entry,type:'album-skin-refund',purchaseId:purchase.id})
      }
      if (replacement || additions.length) {
        const updated = additions.length ? {state:{schemaVersion:1 as const,events:[...(section.state?.events ?? []), ...additions]}} : section
        if (additions.length) projectLocalCollectionSettings(updated)
        if (!write.run(JSON.stringify(updated),namespace,revision).changes) throw Error('收藏修订号已变化。')
        revision++
      }
      db.exec('COMMIT')
      cached = {revision,earned}
      return {revision, conflict:false}
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  return {reconcile}
}
