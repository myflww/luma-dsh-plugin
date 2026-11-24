import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  CHARACTER_NAMES, LOCAL_COLLECTION_SETTINGS_NAMESPACE, LOCAL_GRANT_CARD_KEYS, projectLocalCollectionSettings,
  type CharacterId, type LocalCollectionSettings, type LocalProfileGrant,
} from '../src/shared/local-collection-domain.ts'

function eventDigest(event: LocalProfileGrant) {
  return createHash('sha256').update(JSON.stringify([event.id, event.at, event.versionKeys, event.employeeIds])).digest('hex')
}

export function verifyLocalGrantReceipts(db: DatabaseSync, section: LocalCollectionSettings) {
  for (const event of section.state?.events ?? []) {
    if (event.type !== 'local-profile-grant') continue
    const receipt = db.prepare('SELECT id FROM wallet_receipts WHERE kind=? AND source=? AND amount=1').get(event.type,event.id)
    if (receipt?.id !== eventDigest(event)) throw Error('此收藏授予记录未在当前本机档案授权。')
  }
}

/** Offline maintenance only. The caller supplies a hash of the backed-up original section. */
export function grantLocalProfileCollection(db: DatabaseSync, backupHash: string) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const row = db.prepare('SELECT value,revision FROM sections WHERE ns=?').get(LOCAL_COLLECTION_SETTINGS_NAMESPACE)
    if (!row) throw Error('找不到本机收藏档案。')
    const section: LocalCollectionSettings = JSON.parse(String(row.value))
    const current = projectLocalCollectionSettings(section)
    verifyLocalGrantReceipts(db, section)
    const versionKeys = LOCAL_GRANT_CARD_KEYS.filter(key => !current.ownedCounts[key])
    const employeeIds = (Object.keys(CHARACTER_NAMES) as CharacterId[]).filter(id => !current.unlockedEmployeeIds.includes(id))
    const revision = Number(row.revision)
    if (versionKeys.length || employeeIds.length) {
      if (createHash('sha256').update(String(row.value)).digest('hex') !== backupHash)
        throw Error('收藏已更改，请备份当前档案再继续。')
      const event: LocalProfileGrant = {id:randomUUID(), at:Date.now(), type:'local-profile-grant', versionKeys, employeeIds}
      const next = {state:{schemaVersion:1 as const,events:[...(section.state?.events ?? []),event]}}
      projectLocalCollectionSettings(next)
      db.prepare('INSERT INTO wallet_receipts(kind,source,amount,id,at) VALUES(?,?,1,?,?)').run(event.type,event.id,eventDigest(event),event.at)
      const write = db.prepare('UPDATE sections SET value=?, revision=revision+1 WHERE ns=? AND revision=?')
      if (write.run(JSON.stringify(next),LOCAL_COLLECTION_SETTINGS_NAMESPACE,revision).changes !== 1)
        throw Error('收藏版本发生变化。')
    }
    db.exec('COMMIT')
    return {addedCards:versionKeys.length, addedEmployees:employeeIds.length, revision:revision + Number(!!(versionKeys.length || employeeIds.length))}
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
