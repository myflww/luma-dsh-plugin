// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createEmployeeUsage } from '../src/host/employee-usage.ts'
import { createCollectionWallet } from '../native-desktop/collection-wallet.ts'
import { grantLocalProfileCollection } from '../native-desktop/local-profile-grant.ts'
import { CHARACTER_NAMES, LOCAL_GRANT_CARD_KEYS } from '../src/shared/local-collection-domain.ts'
import { LOCAL_COLLECTION_SETTINGS_NAMESPACE as ns } from '../src/local-collection-settings.ts'
import { SHOP_BEDROOMS, type ShopBedroom } from '../src/shared/shop-bedrooms.ts'
import { localCollectionDay, localCollectionUserEventCount, LOCAL_COLLECTION_LIMIT, projectLocalCollectionSettings, type LocalCollectionEvent } from '../src/shared/local-collection-domain.ts'
import { PACK_POOL_VERSION, getPackOdds, getPackPool } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'

const cleanup: (() => void)[] = []
afterEach(() => { while (cleanup.length) cleanup.pop()!() })
const section = (events: LocalCollectionEvent[]) => ({state:{schemaVersion:1 as const, events}})
const welcome = {type:'welcome', id:'welcome-in-legacy', at:1} as const
const legacy = section([welcome, {type:'buy-album-skin', id:'purchase-silk', at:2, skinId:'dawn',price:80},
  {type:'buy-album-skin', id:'purchase-amber', at:3, skinId:'prism',price:100},
  {type:'equip-album-skin',id:'equip-amber',at:4,skinId:'prism'}])
function openWallet(path = ':memory:', initial: object = {}) {
  const db = new DatabaseSync(path)
  cleanup.push(() => db.close())
  db.exec('CREATE TABLE IF NOT EXISTS sections(ns TEXT PRIMARY KEY,revision INTEGER NOT NULL,value TEXT NOT NULL)')
  db.prepare('INSERT OR IGNORE INTO sections VALUES(?,0,?)').run(ns,JSON.stringify(initial))
  const meter = createEmployeeUsage(db,{readSession:async () => {throw Error()}},{})
  const wallet = createCollectionWallet(db,meter)
  const saved = () => {
    const row = db.prepare('SELECT revision,value FROM sections WHERE ns=?').get(ns)!
    const value = JSON.parse(String(row.value))
    return {revision:Number(row.revision),value,projected:projectLocalCollectionSettings(value)}
  }
  return {db,meter,wallet,saved}
}

test('permanently unlocks only the purchased universal rooms, charging once across two SQLite connections and restarts',()=>{
  const folder=mkdtempSync(join(tmpdir(),'luma-bedroom-wallet-'))
  cleanup.push(()=>rmSync(folder,{recursive:true,force:true}))
  const path=join(folder,'wallet.db'), a=openWallet(path), b=openWallet(path)
  const [first,second,third,fourth]=SHOP_BEDROOMS
  const buy=(room:ShopBedroom,id:string,price:number=room.price):LocalCollectionEvent=>({id,at:10,type:'buy-bedroom-skin',themeId:room.id,price})
  const zero=section([buy(first,'missing-funds')])
  expect(()=>a.wallet.reconcile({expectedRevision:0,section:zero})).toThrow()
  a.wallet.reconcile({expectedRevision:0,section:section([welcome])})
  const one=buy(first,'first-bedroom'),firstSale=section([welcome,one])
  expect(()=>a.wallet.reconcile({expectedRevision:1,section:section([welcome,buy(first,'wrong-price',1)])})).toThrow()
  a.wallet.reconcile({expectedRevision:1,section:firstSale})
  expect(b.wallet.reconcile({expectedRevision:1,section:firstSale}).conflict).toBe(true)
  expect(()=>b.wallet.reconcile({expectedRevision:2,section:section([welcome,one,buy(first,'repeated-skin')])})).toThrow()
  b.wallet.reconcile({expectedRevision:2,section:section([welcome,one,buy(fourth,'second-bedroom')])})
  const final=openWallet(path).saved().projected
  expect(final.balance).toBe(0)
  expect(final.unlockedThemeIds).toEqual([first.id,fourth.id])
  expect(final.unlockedEmployeeIds).toEqual(['jingyuniang'])
  expect(final.purchases.map(p=>[p.kind,p.price])).toEqual([['bedroom-skin',120],['bedroom-skin',180]])
  expect(final.ledger.map(r=>r.delta)).toEqual([300,-120,-180])
  expect(final.unlockedThemeIds).not.toContain(second.id)
  expect(final.unlockedThemeIds).not.toContain(third.id)
})

test('retired bindings refund both actual prices once, preserve the chosen artwork, and restore old receipts identically', () => {
  const {wallet,saved} = openWallet(':memory:',legacy)
  expect(saved().projected.balance).toBe(120)
  expect(wallet.reconcile().revision).toBe(1)
  const first = saved()
  expect(first.projected).toMatchObject({balance:300,albumSkinIds:['classic','dawn','prism'],albumSkin:{id:'prism'},refundedAlbumPurchaseIds:['purchase-silk','purchase-amber']})
  expect(first.projected.ledger.slice(-2).map(entry => entry.delta)).toEqual([80,100])
  expect(wallet.reconcile().revision).toBe(1)
  expect(wallet.reconcile({section:legacy,expectedRevision:1,restore:true}).revision).toBe(2)
  expect(saved().value).toEqual(first.value)
  expect(wallet.reconcile({section:first.value,expectedRevision:2,restore:true}).revision).toBe(3)
  expect(saved().projected.balance).toBe(300)
  const duplicate = section([...first.value.state.events,{type:'album-skin-refund',id:'duplicate-refund',at:5,purchaseId:'purchase-amber'}])
  expect(() => wallet.reconcile({section:duplicate,expectedRevision:3,restore:true})).toThrow()
  expect(saved().revision).toBe(3)
})

test('grants per employee at whole millions, preserves remainders, and validates restored token awards against profile receipts', () => {
  const {wallet,meter,saved} = openWallet()
  meter.recordModelUsage('shan','one',800_000)
  meter.recordModelUsage('jingyuniang','one',900_000)
  expect(wallet.reconcile().revision).toBe(0)
  meter.recordModelUsage('jingyuniang','two',2_100_024)
  meter.recordModelUsage('shan','two',300_000)
  expect(wallet.reconcile().revision).toBe(1)
  const first = saved()
  expect(first.projected).toMatchObject({balance:4,tokenRewardCoins:{shan:1,jingyuniang:3}})
  meter.recordModelUsage('jingyuniang','two',2_100_024)
  expect(wallet.reconcile().revision).toBe(1)
  meter.recordModelUsage('shan','two',1_200_001)
  expect(wallet.reconcile().revision).toBe(2)
  expect(saved().projected.ledger.at(-1)?.delta).toBe(1)
  // A corrected underlying usage record cannot revoke an already settled receipt or pay it twice.
  meter.recordModelUsage('shan','two',100_000)
  expect(wallet.reconcile({section:first.value,expectedRevision:2,restore:true}).revision).toBe(3)
  expect(saved().projected.balance).toBe(5)
  const other = openWallet()
  expect(() => other.wallet.reconcile({section:first.value,expectedRevision:0,restore:true})).toThrow()
  expect(other.saved().revision).toBe(0)
})

test('two connections serialize credit and spending, roll back failed writes, and disallow new client-issued retired purchases', () => {
  const directory = mkdtempSync(join(tmpdir(),'luma-wallet-cas-'))
  cleanup.push(() => rmSync(directory,{recursive:true,force:true}))
  const path = join(directory,'profile.db'), a = openWallet(path), b = openWallet(path)
  a.wallet.reconcile({section:section([welcome]),expectedRevision:0})
  const before = a.saved()
  const pack = {type:'buy-pack', id:'one-card-purchase',at:2,packId:'first-meeting-journey',price:10,poolVersion:PACK_POOL_VERSION} as const
  const stale = {section:section([...before.value.state.events,pack]),expectedRevision:before.revision}
  b.meter.recordModelUsage('shan','request',1_234_567)
  a.db.exec("CREATE TRIGGER break_settlement BEFORE UPDATE ON sections BEGIN SELECT RAISE(ABORT,'fixture'); END")
  expect(() => b.wallet.reconcile()).toThrow()
  expect(a.db.prepare('SELECT COUNT(*) AS n FROM wallet_receipts').get()?.n).toBe(0)
  a.db.exec('DROP TRIGGER break_settlement')
  expect(b.wallet.reconcile().revision).toBe(2)
  expect(a.wallet.reconcile(stale)).toMatchObject({conflict:true,revision:2})
  const credited = a.saved()
  expect(a.wallet.reconcile({section:section([...credited.value.state.events,pack]),expectedRevision:2}).revision).toBe(3)
  const restart = openWallet(path)
  expect(restart.wallet.reconcile().revision).toBe(3)
  expect(restart.saved().projected).toMatchObject({balance:291,tokenRewardCoins:{shan:1},purchases:[{kind:'pack',price:10}]})
  const retiredSale = section([...restart.saved().value.state.events,legacy.state.events[1]!])
  expect(() => restart.wallet.reconcile({section:retiredSale,expectedRevision:3})).toThrow()
  expect(restart.saved().revision).toBe(3)
})

test('automatic deposits still settle when a legacy collection reaches its user operation limit', () => {
  const daily = (i: number): LocalCollectionEvent => {
    const at = Date.UTC(2000,0,1) + i * 86_400_000
    return {type:'daily',at,id:`legacy-claim-${i}`,day:localCollectionDay(at)}
  }
  const events = Array.from({length:LOCAL_COLLECTION_LIMIT},(_,i)=>daily(i))
  const {wallet,meter,saved} = openWallet(':memory:',section(events))
  meter.recordModelUsage('jingyuniang','full-wallet',1_003_050)
  expect(wallet.reconcile().revision).toBe(1)
  const settled = saved().value.state.events
  expect(settled.length).toBe(LOCAL_COLLECTION_LIMIT + 1)
  expect(localCollectionUserEventCount(settled)).toBe(LOCAL_COLLECTION_LIMIT)
  expect(() => projectLocalCollectionSettings(section([...settled,daily(LOCAL_COLLECTION_LIMIT)]))).toThrow()
})

test('an explicit local grant supplies missing editions and roles while preserving previous cards, spending and draw quotas', () => {
  const {db,wallet,saved} = openWallet()
  const packId = 'first-meeting-journey', art = getPackPool(packId)[0]!
  const initial = section([welcome,
    {type:'buy-pack',id:'prior-purchase',at:2,packId,price:10,poolVersion:PACK_POOL_VERSION},
    {type:'open-pack',id:'prior-opening',at:3,packInstanceId:'prior-purchase',versionKey:art.key,rarity:art.rarity,poolVersion:PACK_POOL_VERSION,odds:getPackOdds(packId,{})}])
  wallet.reconcile({section:initial, expectedRevision:0})
  const before = saved()
  const hash = createHash('sha256').update(JSON.stringify(before.value)).digest('hex')
  expect(() => grantLocalProfileCollection(db,'stale-backup')).toThrow(/备份/)
  expect(grantLocalProfileCollection(db,hash)).toEqual({revision:2,addedCards:225,addedEmployees:7})
  const after = saved(), grants = after.value.state.events.slice(-1)
  expect(after.projected.cards).toContainEqual(before.projected.cards[0])
  expect(after.value.state.events.slice(0,-1)).toEqual(initial.state.events)
  expect(Object.keys(after.projected.ownedCounts).sort()).toEqual([...LOCAL_GRANT_CARD_KEYS].sort())
  expect(after.projected.unlockedEmployeeIds.toSorted()).toEqual(Object.keys(CHARACTER_NAMES).sort())
  expect(after.projected.unlockedThemeIds.length).toBeGreaterThan(0)
  expect(after.projected).toMatchObject({packs:before.projected.packs, purchases:before.projected.purchases,
    drawCounts:before.projected.drawCounts, balance:before.projected.balance, openedCards:before.projected.openedCards})
  expect(after.projected.ledger.slice(0,-1)).toEqual(before.projected.ledger)
  expect(after.projected.cards.filter(card=>card.grantId)).toHaveLength(225)
  expect(grantLocalProfileCollection(db,hash)).toEqual({revision:2,addedCards:0,addedEmployees:0})
  expect(wallet.reconcile({section:after.value, expectedRevision:2, restore:true}).revision).toBe(3)
  const other = openWallet(':memory:',initial)
  for (const restore of [true,false]) expect(() => other.wallet.reconcile({section:after.value, expectedRevision:0,restore})).toThrow(/授权/)
  const altered = section([...initial.state.events,{...grants[0],versionKeys:grants[0].versionKeys.slice(1)}])
  expect(() => wallet.reconcile({section:altered, expectedRevision:3,restore:true})).toThrow(/授权/)
  expect(other.saved().projected.cards).toHaveLength(1)
})
