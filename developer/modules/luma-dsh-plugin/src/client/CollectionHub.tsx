import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { getPackOdds, drawCountForCard, MAX_CARD_DRAWS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { LOCAL_DAILY_COINS, LOCAL_PACKS, LOCAL_WELCOME_COINS, getVisibleGuideCards,
  localCollectionDay, localPackAvailability, canRedeemCard, characterIdForCard, CHARACTER_NAMES, type CharacterId, type LocalAlbumSkin } from '../shared/local-collection-domain.ts'
import type { LocalCollectionResult, LocalCollectionRuntime } from './local-collection-store.ts'
import './CollectionHub.css'
import { EmployeeUsagePanel } from './EmployeeUsagePanel.tsx'
import { BookOpen, ChartNoAxesColumn, Coins, History, Package, PackageOpen, ShoppingBag, UsersRound } from 'lucide-react'
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
  const [tab, setTab] = useState<'packs' | 'sealed' | 'usage' | 'history' | 'rewards'>(initialPackId === 'sealed' ? 'sealed' : 'packs')
  const [targetPack, setTargetPack] = useState(initialPackId === 'sealed' ? undefined : initialPackId)
  const [invitation, setInvitation] = useState<{employeeId: CharacterId; instanceId: string}>()
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [revealedIds, setRevealedIds] = useState<readonly string[]>([])
  const [historyOpeningId, setHistoryOpeningId] = useState<string | null>(null)
  const [openingBusy, setOpeningBusy] = useState(false)
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
  return <section ref={hubRef} className="lumaCollectionHub" data-shop-tab={tab} aria-label="本地卡包商店">
    <header className="lumaCollectionHubHeader">
      <div><h2>{({packs:'卡包商店',sealed:'未开封卡包',rewards:'伙伴兑换',usage:'员工用量',history:'收支记录'})[tab]}</h2></div>
      <div className="lumaCollectionHubWallet"><span><Coins size={16} aria-hidden="true"/>星币</span><strong aria-label={`余额 ${snapshot.balance} 星币`}>{snapshot.balance.toLocaleString('zh-CN')}</strong>
        <div>{!snapshot.welcomeClaimed && <button type="button" disabled={disabled} onClick={() => { void act(runtime.store.claimWelcome, '新册礼已存入本地钱包') }}>领取 {LOCAL_WELCOME_COINS} 新册礼</button>}
          <button type="button" disabled={disabled || !!snapshot.lastDailyClaim && today <= snapshot.lastDailyClaim} onClick={() => { void act(runtime.store.claimDaily, '今日星币已存入本地钱包') }}>{snapshot.lastDailyClaim && today <= snapshot.lastDailyClaim ? '今日已领取' : `领取每日 ${LOCAL_DAILY_COINS} 星币`}</button></div>

      </div>
    </header>
    {snapshot.problem && <p className="lumaCollectionHubMessage is-error" role="alert">{snapshot.problem}</p>}
    {(message || snapshot.pending) && <p className={`lumaCollectionHubMessage${failed ? ' is-error' : ''}`} role={failed ? 'alert' : 'status'}>{snapshot.pending ? '正在保存到 DSH…' : message}</p>}
    <nav className="lumaCollectionHubTabs" aria-label="卡包商店导航">{([
      ['packs', '卡包店',ShoppingBag], ['sealed', `未开封 · ${sealed.length}`,Package], ['rewards', '伙伴与空间',UsersRound], ['usage', '员工用量',ChartNoAxesColumn], ['history', '收支记录',History],
    ] as const).map(([id, label,Icon]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} aria-controls={`${tabsId}-${id}`} onClick={() => { setInvitation(undefined); setTab(id) }}><Icon size={15} aria-hidden="true"/>{label}</button>)}</nav>

    {tab === 'packs' && <div id={`${tabsId}-packs`}>
      <div className="lumaShopShelfHeading"><h3>实体卡包 <small>每包 1 张</small></h3>
        {onOpenOwned && <button type="button" onClick={onOpenOwned}><BookOpen size={15} aria-hidden="true"/>我的卡册</button>}</div>
      <div className="lumaCollectionHubGrid">{LOCAL_PACKS.map(pack => {
        const capacity = localPackAvailability(snapshot, pack.id), odds = getPackOdds(pack.id, snapshot.drawCounts)[0]
        const pool = getVisibleGuideCards(snapshot, pack.id)
        return <article key={pack.id} data-pack-id={pack.id} tabIndex={-1} className="lumaCollectionHubProduct">
          <div className="lumaCollectionHubPackArt"><img src={pack.artworkUrl} alt={`${pack.name}卡包`} loading="lazy" /></div>
          <div className="lumaShopProductCopy"><div><h3>{pack.name}</h3><p>{[...new Set(pool.map(card => card.character))].join('、')}</p></div>
            <div className="lumaCollectionHubPrice"><strong>{pack.price} <small>星币</small></strong><small>{capacity === 0 ? '额度已用完' : snapshot.balance < pack.price ? '星币不足' : `余量 ${capacity} 包`}</small></div>
            <div className="lumaShopProductActions"><button type="button" className="lumaShopPurchase" disabled={disabled || snapshot.balance < pack.price || capacity < 1} onClick={() => { void act(() => runtime.store.buyPack(pack.id), `${pack.name}已放入未开封卡包`) }}>购买一包</button>
              <button type="button" className="lumaPackTry" disabled={openingBusy} onClick={() => setSamplePack(pack)} aria-label={'免费试拆'+pack.name}><PackageOpen size={14} aria-hidden="true"/>免费试拆</button></div>
          </div>
          <details><summary>查看当前概率与卡池</summary>
            <div className="lumaShopOdds" aria-label="各品质总概率">{odds?.rarities.filter(tier => tier.probability > 0).map(tier =>
              <div key={tier.rarity} data-rarity={tier.rarity}><span>{tier.rarity}</span><strong>{percent(tier.probability)}</strong>
                <i aria-hidden="true"><i style={{width:percent(tier.probability)}} /></i></div>)}</div>
            <p>每个版本累计最多抽到 {MAX_CARD_DRAWS} 张，兑换后仍计入。</p>
            <ul className="lumaCollectionHubPool" aria-label={pack.name + '已公开版本与单张概率'}>{pool.map(card => {
              const issued = drawCountForCard(card.key, snapshot.drawCounts, pack.id)
              const channel = odds?.editionChannels?.find(row => row.edition === (card.edition === 'errata' ? 'errata' : 'regular'))
              const chance = channel?.rarities.find(tier => tier.rarity === card.rarity)?.perCardProbability ?? 0
              return <li key={card.key} data-edition-key={card.key}><b>{card.rarity}</b><span>{card.name}<small>{card.edition === 'errata' && '错版 · '}{card.versionLabel}</small></span>
                <span>{percent(issued < MAX_CARD_DRAWS ? chance : 0)}<small>余 {Math.max(0, MAX_CARD_DRAWS - issued)} 张</small></span></li>
            })}</ul>
          </details>
        </article>
      })}</div>
    </div>}

    {tab === 'sealed' && <div id={`${tabsId}-sealed`}><SealedPackShelf packs={sealed} disabled={disabled}
      onOpen={ids=>{void openPacks(ids)}} onShop={()=>setTab('packs')}/></div>}

    {tab === 'rewards' && <div id={`${tabsId}-rewards`}><CompanionRewards runtime={runtime} invitation={invitation} onFindPack={id => { setTargetPack(id); setTab('packs') }} /></div>}
    {tab === 'usage' && <div id={`${tabsId}-usage`}><EmployeeUsagePanel runtime={runtime} unlocked={snapshot.unlockedEmployeeIds}/></div>}

    {tab === 'history' && <div id={`${tabsId}-history`} className="lumaCollectionHubHistory"><div className="lumaCollectionHubSectionHeading"><h3>交易明细</h3><p>已购入 {snapshot.purchases.length} 笔 · 开出 {snapshot.openedCards.length} 张卡片</p></div>
      {!snapshot.ledger.length ? <p className="lumaCollectionHubEmpty">领取新册礼后，第一条记录会从这里开始。</p> : <><ol>{snapshot.ledger.slice(-historyCount).reverse().map(entry => <li key={entry.id}>
        <div><strong>{entry.label}</strong><small>{time(entry.at)} · {entry.id.slice(-12)}</small>
          {cardsByOpening.has(entry.id) && <button type="button" className="lumaCollectionHubReplay" disabled={openingBusy}
            aria-label={`重看${entry.label}`} onClick={() => setHistoryOpeningId(entry.id)}>重看开包</button>}
        </div><span className={entry.delta > 0 ? 'is-credit' : ''}>{entry.delta > 0 ? '+' : ''}{entry.delta || '—'}</span><small>余额 {entry.balance}</small>
      </li>)}</ol>{snapshot.ledger.length > historyCount && <button type="button" onClick={() => setHistoryCount(count => count + 50)}>显示更早记录</button>}</>}
    </div>}

    {samplePack && <PackCollectionPreview collection={snapshot} initialPackId={samplePack.id} onClose={()=>setSamplePack(null)}/>}
    {!!revealed.length && <PackOpeningScene cards={revealed} historyReplay={historyOpeningId !== null} onClose={closeOpening} invitationFor={invitationFor}
      {...onOpenOwned ? { onOpenOwned: () => { closeOpening(); onOpenOwned() } } : {}} />}
  </section>
}
