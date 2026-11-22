import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { getPackOdds, getPackPool, drawCountForCard, MAX_CARD_DRAWS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { LOCAL_ALBUM_SKINS, LOCAL_DAILY_COINS, LOCAL_PACKS, LOCAL_WELCOME_COINS, CARD_DRAW_LIMIT_RULE,
  localCollectionDay, localPackAvailability, canRedeemCard, characterIdForCard, CHARACTER_NAMES, type CharacterId, type LocalAlbumSkin } from '../shared/local-collection-domain.ts'
import type { LocalCollectionResult, LocalCollectionRuntime } from './local-collection-store.ts'
import './CollectionHub.css'
import { Coins } from 'lucide-react'
import { SealedPackShelf } from './SealedPackShelf.tsx'
import { PackOpeningScene } from './PackOpeningScene.tsx'
import { PackCollectionPreview } from './PackCollectionPreview.tsx'
import { CompanionRewards } from './CompanionRewards.tsx'

export function localAlbumStyle(skin: LocalAlbumSkin): CSSProperties {
  return { '--local-album-paper': skin.paper, '--local-album-panel': skin.panel, '--local-album-ink': skin.ink,
    '--local-album-muted': skin.muted, '--local-album-accent': skin.accent, '--local-album-line': skin.line } as CSSProperties
}
const time = (at: number) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(at)
const percent = (value: number) => `${(value * 100).toLocaleString('zh-CN', { maximumFractionDigits: 3 })}%`

/** Purchases and revealed cards render only after the Host confirms the complete transaction. */
export function CollectionHub({ runtime, onOpenOwned, initialPackId }: { runtime: LocalCollectionRuntime; onOpenOwned?(): void; initialPackId?: string | undefined }) {
  const snapshot = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot, runtime.store.getSnapshot)
  const [tab, setTab] = useState<'packs' | 'sealed' | 'skins' | 'history' | 'rewards'>(initialPackId === 'sealed' ? 'sealed' : 'packs')
  const [targetPack, setTargetPack] = useState(initialPackId === 'sealed' ? undefined : initialPackId)
  const [invitation, setInvitation] = useState<{employeeId: CharacterId; instanceId: string}>()
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [revealedIds, setRevealedIds] = useState<readonly string[]>([])
  const [historyOpeningId, setHistoryOpeningId] = useState<string | null>(null)
  const [openingBusy, setOpeningBusy] = useState(false)
  const [materialPreview, setMaterialPreview] = useState(false)
  const [samplePack, setSamplePack] = useState<(typeof LOCAL_PACKS)[number] | null>(null)
  const openingLock = useRef(false)
  const alive = useRef(true)
  const [historyCount, setHistoryCount] = useState(30)
  const [today, setToday] = useState(() => localCollectionDay(Date.now()))
  const hubRef = useRef<HTMLElement>(null)
  const tabsId = useId()
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const update = () => setToday(localCollectionDay(Date.now()))
    const timer = setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [])
  const disabled = !snapshot.writable || snapshot.pending || openingBusy
  const sealed = snapshot.packs.filter(pack => pack.openedAt === undefined)
  const cardsByOpening = useMemo(() => new Map(snapshot.openedCards.map(card => [card.openingId, card])), [snapshot.openedCards])
  useEffect(() => {
    if (tab !== 'packs' || !targetPack) return
    const item = Array.from(hubRef.current?.querySelectorAll<HTMLElement>('[data-pack-id]') ?? []).find(node => node.dataset.packId === targetPack)
    item?.focus({preventScroll:true}); item?.scrollIntoView?.({block:'nearest'})
    setTargetPack(undefined)
  }, [tab, targetPack])
  const revealed = (historyOpeningId ? [historyOpeningId] : revealedIds).flatMap(id => {
    const card = cardsByOpening.get(id)
    return card ? [card] : []
  })
  const invitationFor = (key: string, instanceId: string) => {
    const employeeId = characterIdForCard(key)
    if (!employeeId || !canRedeemCard(key) || snapshot.unlockedEmployeeIds.includes(employeeId) || !snapshot.cards.some(card => card.id === instanceId)) return
    return { label: `邀请${CHARACTER_NAMES[employeeId]}入职`, open() {
      closeOpening(); setInvitation({employeeId, instanceId}); setTab('rewards')
    } }
  }
  function closeOpening() { setHistoryOpeningId(null); setRevealedIds([]) }
  async function act(operation: () => Promise<LocalCollectionResult>, success: string) {
    setMessage(''); setFailed(false)
    try {
      const result = await operation()
      if (result.status === 'rejected') { setMessage(result.message); setFailed(true); return }
      setMessage(success)
      if (result.status === 'saved' && result.event.type === 'open-pack') setRevealedIds([result.event.id])
      if (result.status === 'saved' && result.event.type === 'buy-pack') setTab('sealed')
    } catch { setMessage('没有收到保存确认，请检查连接后重试。'); setFailed(true) }
  }
  async function openPacks(ids: readonly string[]) {
    if (openingLock.current) return
    openingLock.current = true; setOpeningBusy(true); setMessage(''); setFailed(false)
    const saved: string[] = []
    let problem = ''
    try {
      for (const id of ids.slice(0, 5)) {
        if (!alive.current) break
        const result = await runtime.store.openPack(id)
        if (result.status === 'rejected') { problem = result.message; break }
        if (result.status === 'saved' && result.event.type === 'open-pack') saved.push(result.event.id)
      }
    } catch { problem = '没有收到保存确认，请检查连接后重试。' }
    finally { openingLock.current = false; if (alive.current) setOpeningBusy(false) }
    if (!alive.current) return
    // Partial batches reveal only acknowledged acquisitions; unprocessed packs stay sealed.
    if (saved.length) setRevealedIds(saved)
    setFailed(!!problem)
    setMessage(problem ? (saved.length ? `已保存 ${saved.length} 张卡片。` : '') + problem : `${saved.length} 张卡片已保存到本地持有记录`)
  }
  if (materialPreview) return <PackCollectionPreview onClose={() => setMaterialPreview(false)} />
  return <section ref={hubRef} className="lumaCollectionHub" data-shop-tab={tab} aria-label="本地卡包与卡册装帧">
    <header className="lumaCollectionHubHeader">
      <div><h2>卡包与装帧</h2><p>挑一包收藏，拆开后收入自己的卡册。</p></div>
      <div className="lumaCollectionHubWallet"><span><Coins size={16} aria-hidden="true"/>星币</span><strong aria-label={`余额 ${snapshot.balance} 星币`}>{snapshot.balance.toLocaleString('zh-CN')}</strong>
        <div>{!snapshot.welcomeClaimed && <button type="button" disabled={disabled} onClick={() => { void act(runtime.store.claimWelcome, '新册礼已存入本地钱包') }}>领取 {LOCAL_WELCOME_COINS} 新册礼</button>}
          <button type="button" disabled={disabled || !!snapshot.lastDailyClaim && today <= snapshot.lastDailyClaim} onClick={() => { void act(runtime.store.claimDaily, '今日星币已存入本地钱包') }}>{snapshot.lastDailyClaim && today <= snapshot.lastDailyClaim ? '今日已领取' : `领取每日 ${LOCAL_DAILY_COINS} 星币`}</button></div>

      </div>
    </header>
    {snapshot.problem && <p className="lumaCollectionHubMessage is-error" role="alert">{snapshot.problem}</p>}
    {(message || snapshot.pending) && <p className={`lumaCollectionHubMessage${failed ? ' is-error' : ''}`} role={failed ? 'alert' : 'status'}>{snapshot.pending ? '正在保存到 DSH…' : message}</p>}
    <nav className="lumaCollectionHubTabs" aria-label="卡包与装帧导航">{([
      ['packs', '卡包店'], ['sealed', `未开封 · ${sealed.length}`], ['rewards', '伙伴与空间'], ['skins', '卡册装帧'], ['history', '收支记录'],
    ] as const).map(([id, label]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} aria-controls={`${tabsId}-${id}`} onClick={() => { setInvitation(undefined); setTab(id) }}>{label}</button>)}</nav>

    {tab === 'packs' && <div id={`${tabsId}-packs`}>
      <p className="lumaCollectionHubRule">每包一张，购买后放入「未开封」。{CARD_DRAW_LIMIT_RULE}</p>
      <div className="lumaCollectionHubGrid">{LOCAL_PACKS.map(pack => {
        const capacity = localPackAvailability(snapshot, pack.id), odds = getPackOdds(pack.id, snapshot.drawCounts)[0]
        const pool = getPackPool(pack.id)
        return <article key={pack.id} data-pack-id={pack.id} tabIndex={-1} className="lumaCollectionHubProduct">
          <div className="lumaCollectionHubPackArt"><img src={pack.artworkUrl} alt={`${pack.name}卡包`} loading="lazy" /><span>{pack.id === 'first-meeting-journey' ? '吉米 · 折光未来包装' : '单张收藏包'}</span></div>
          <h3>{pack.name}</h3><p>{pack.description}</p>
          <button type="button" className="lumaPackTry" disabled={openingBusy} onClick={() => setSamplePack(pack)} aria-label={'免费试拆'+pack.name}>免费试拆</button>
          <div className="lumaCollectionHubPrice"><strong>{pack.price} <small>星币</small></strong><button type="button" disabled={disabled || snapshot.balance < pack.price || capacity < 1} onClick={() => { void act(() => runtime.store.buyPack(pack.id), `${pack.name}已放入未开封卡包`) }}>购买一包</button></div>
          <small>{capacity ? `还可购买 ${capacity} 包 · 已为未开包保留额度` : '当前卡池额度已用完'}</small>
          <details><summary>查看当前概率与卡池</summary><p>概率随已达到上限的卡片排除而变化。下表展示这次开启前的实际配置，结果会保存同一份概率快照。</p>
            <table><thead><tr><th>版本</th><th>品质</th><th>卡面</th><th>概率</th><th>每张</th></tr></thead><tbody>
              {(odds?.editionChannels ?? []).flatMap(channel => channel.rarities.filter(tier => tier.cardCount > 0).map(tier => <tr key={`${channel.edition}-${tier.rarity}`}><td>{channel.edition === 'regular' ? '正版' : '错版'}</td><td>{tier.rarity}</td><td>{tier.cardCount}</td><td>{percent(tier.probability)}</td><td>{percent(tier.perCardProbability)}</td></tr>))}
            </tbody></table>
            <ul className="lumaCollectionHubPool">{pool.map(card => <li key={card.key}><span>{card.name} · {card.rarity}{card.edition === 'errata' ? ' · 错版' : ''}</span><small>{Math.max(0, MAX_CARD_DRAWS - drawCountForCard(card.key, snapshot.drawCounts, pack.id))}/{MAX_CARD_DRAWS} 张余量</small></li>)}</ul>
          </details>
        </article>
      })}</div>
    <details className="lumaCollectionHubMaterials"><summary>试拆与美术预览</summary><div><p>在这里欣赏的样卡不会计入卡册。</p><button type="button" disabled={openingBusy} onClick={() => setSamplePack(LOCAL_PACKS[0]!)}>免费体验拆包</button><button type="button" disabled={openingBusy} onClick={() => setMaterialPreview(true)}>浏览美术素材</button></div></details>
    </div>}

    {tab === 'sealed' && <div id={`${tabsId}-sealed`}><SealedPackShelf packs={sealed} disabled={disabled}
      onOpen={ids=>{void openPacks(ids)}} onShop={()=>setTab('packs')}/></div>}

    {tab === 'rewards' && <div id={`${tabsId}-rewards`}><CompanionRewards runtime={runtime} invitation={invitation} onFindPack={id => { setTargetPack(id); setTab('packs') }} /></div>}
    {tab === 'skins' && <div id={`${tabsId}-skins`}>
      <div className="lumaCollectionHubSectionHeading"><h3>给收藏换一页心情</h3><p>购买后可随时切换。预览使用现有原始卡背，不改变卡片本身。</p></div>
      <div className="lumaCollectionHubSkinGrid">{LOCAL_ALBUM_SKINS.map(skin => {
        const owned = snapshot.albumSkinIds.includes(skin.id), equipped = snapshot.albumSkin.id === skin.id
        return <article key={skin.id} className="lumaCollectionHubSkin" style={localAlbumStyle(skin)}>
          <div className="lumaCollectionHubBookPreview" aria-label={`${skin.name}装帧预览`}><span>我的收藏</span><div><img src={skin.coverUrl} alt="" /><div><i /><i /><i /></div></div><small>一册相遇 · LUMA</small></div>
          <h3>{skin.name}</h3><p>{skin.description}</p><div className="lumaCollectionHubPrice"><strong>{owned ? '已收藏' : `${skin.price} 星币`}</strong>
            <button type="button" aria-pressed={equipped} disabled={disabled || equipped || !owned && snapshot.balance < skin.price} onClick={() => { void act(() => owned ? runtime.store.equipAlbumSkin(skin.id) : runtime.store.buyAlbumSkin(skin.id), owned ? `已使用${skin.name}装帧` : `${skin.name}已购入，点击使用即可装备`) }}>{equipped ? '使用中' : owned ? '使用装帧' : '购买装帧'}</button></div>
        </article>
      })}</div>
    </div>}

    {tab === 'history' && <div id={`${tabsId}-history`} className="lumaCollectionHubHistory"><div className="lumaCollectionHubSectionHeading"><h3>每一次收藏，都有来处</h3><p>已购入 {snapshot.purchases.length} 笔 · 开出 {snapshot.openedCards.length} 张卡片 · 当前余额 {snapshot.balance} 星币</p></div>
      {!snapshot.ledger.length ? <p className="lumaCollectionHubEmpty">领取新册礼后，第一条记录会从这里开始。</p> : <><ol>{snapshot.ledger.slice(-historyCount).reverse().map(entry => <li key={entry.id}>
        <div><strong>{entry.label}</strong><small>{time(entry.at)} · {entry.id.slice(-12)}</small>
          {cardsByOpening.has(entry.id) && <button type="button" className="lumaCollectionHubReplay" disabled={openingBusy}
            aria-label={`重看${entry.label}`} onClick={() => setHistoryOpeningId(entry.id)}>重看开包</button>}
        </div><span className={entry.delta > 0 ? 'is-credit' : ''}>{entry.delta > 0 ? '+' : ''}{entry.delta || '—'}</span><small>余额 {entry.balance}</small>
      </li>)}</ol>{snapshot.ledger.length > historyCount && <button type="button" onClick={() => setHistoryCount(count => count + 50)}>显示更早记录</button>}</>}
    </div>}

    {samplePack && <PackOpeningScene preview={{packId:samplePack.id,cardKeys:getPackPool(samplePack.id).slice(0,1).map(card=>card.key)}} onClose={()=>setSamplePack(null)}/>}
    {!!revealed.length && <PackOpeningScene cards={revealed} historyReplay={historyOpeningId !== null} onClose={closeOpening} invitationFor={invitationFor}
      {...onOpenOwned ? { onOpenOwned: () => { closeOpening(); onOpenOwned() } } : {}} />}
  </section>
}
