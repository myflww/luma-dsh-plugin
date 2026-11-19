import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CardLibraryActions, CardEditionDefinition, CardLibrarySnapshot } from './cardLibraryTypes.ts'
import './LumaCardLibrarySurface.css'
import { LumaCardViewer } from './LumaCardViewer.tsx'
import { resolveCardPresentation } from './cardPresentation.ts'
import { PremiumCardFinish } from './PremiumCardFinish.tsx'
import { PRODUCTION_CARD_CATALOG } from './productionCardCatalog.ts'

export interface LumaCardLibrarySurfaceProps {
  cards: readonly CardEditionDefinition[]
  snapshot: CardLibrarySnapshot
  actions: CardLibraryActions
  onBack(): void
  onOpenLegacy?(): void
  onOpenDeviceArchive?(): void
  onOpenShop?(): void
  onOpenExchange?(): void
  /** Instance count is separate from distinct artwork and edition counts. */
  ownedCount?: number
  ownedCounts?: Readonly<Record<string, number>>
  acquiredAtByKey?: Readonly<Record<string, number>>
  /** Current-account themed milestones sit within the gallery, not over the card artwork. */
  themeCollection?: ReactNode
}

type View = 'all' | 'favorites' | 'errata' | 'albums'
type Draft = { value: string; base: string }
const emptyEntry = { favorite: false, rating: null, note: '' }
const titleOf = (card: CardEditionDefinition) => `${card.name} · ${card.versionLabel}${card.historicalRevision ? ' · 历史版本' : ''}`

function Heart({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.35"><path d="M20.8 4.8a5.4 5.4 0 0 0-7.6 0L12 6l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z" /></svg>
}

function Artwork({ card, side = 'front', eager = false }: { card: CardEditionDefinition; side?: 'front' | 'back'; eager?: boolean }) {
  const url = side === 'back' ? card.backUrl : card.frontUrl
  const asset = url ? { url, width: card.width, height: card.height } : null
  const [failedUrl, setFailedUrl] = useState('')
  if (!asset) return <div className="lumaCardLibraryImageError">此版本尚未收录背面</div>
  return <figure className="lumaCardLibraryImage" style={{ aspectRatio: `${asset.width} / ${asset.height}`, '--cl-aspect': asset.width / asset.height } as CSSProperties}>
    {failedUrl === asset.url ? <div className="lumaCardLibraryImageError" role="status">图片暂时无法加载</div> : <><img src={asset.url} alt={side === 'back' ? `${card.name}的卡背` : card.alt} width={asset.width} height={asset.height} loading={eager ? 'eager' : 'lazy'} onError={() => setFailedUrl(asset.url)} />{side === 'front' && <PremiumCardFinish card={resolveCardPresentation(card, PRODUCTION_CARD_CATALOG)} />}</>}
  </figure>
}

/** Artwork and edition identity are catalog-owned; every personal change awaits the Host. */
export function LumaCardLibrarySurface({ cards, snapshot, actions, onOpenShop, onOpenExchange, onOpenDeviceArchive, ownedCount, ownedCounts, acquiredAtByKey, themeCollection }: LumaCardLibrarySurfaceProps) {
  const id = useId()
  const rootRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const tabRef = useRef<HTMLButtonElement>(null)
  const cardButtons = useRef(new Map<string, HTMLButtonElement>())
  const restoreFocus = useRef<string | null>(null)
  const gridScroll = useRef(0)
  const mutationLock = useRef(false)
  const [view, setView] = useState<View>('all')
  const [query, setQuery] = useState('')
  const [series, setSeries] = useState('')
  const [character, setCharacter] = useState('')
  const [sort, setSort] = useState('catalog')
  const [showHistory, setShowHistory] = useState(false)
  const [albumId, setAlbumId] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [detailOrder, setDetailOrder] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [newAlbum, setNewAlbum] = useState('')
  const [renameAlbum, setRenameAlbum] = useState<string | null>(null)
  const [renamedName, setRenamedName] = useState('')
  const [deleteAlbum, setDeleteAlbum] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState(false)
  const writable = snapshot.status === 'ready' && snapshot.writable && snapshot.durable
  const busy = pending || snapshot.pendingCount > 0
  const disabled = !writable || busy
  const entryFor = (key: string) => snapshot.preferences[key] ?? emptyEntry
  const albums = snapshot.albums
  const activeAlbum = albums.find(album => album.id === albumId)
  const selected = cards.find(card => card.key === selectedKey)
  const selectedEntry = selected ? entryFor(selected.key) : emptyEntry
  const selectedDraft = selected ? drafts[selected.key] : undefined
  const note = selectedDraft?.value ?? selectedEntry.note
  const noteDirty = note !== selectedEntry.note
  const noteConflict = !!selectedDraft && selectedDraft.base !== selectedEntry.note && noteDirty
  const favoriteCount = cards.filter(card => entryFor(card.key).favorite).length
  const errataCount = cards.filter(card => card.edition === 'errata').length
  const presentationOnlyKeys = useMemo(() => new Set(cards.flatMap(source => {
    if (source.historicalRevision || source.duplicateOf) return []
    const target = resolveCardPresentation(source, cards)
    return target.key !== source.key && source.character === target.character && source.characterId === target.characterId
      && source.edition === target.edition && source.skin === target.skin ? [target.key] : []
  })), [cards])
  const catalogCards = ownedCounts !== undefined || showHistory ? cards : cards.filter(card => !card.historicalRevision && !card.duplicateOf && !presentationOnlyKeys.has(card.key))
  const workCount = new Set(catalogCards.map(card => card.workId)).size
  const seriesOptions = [...new Set(cards.map(card => card.series))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const characterOptions = [...new Set(cards.map(card => card.character).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    const list = cards.filter(card => {
      const entry = snapshot.preferences[card.key] ?? emptyEntry
      return (view !== 'all' || ownedCounts !== undefined || showHistory || !card.historicalRevision)
        && (view !== 'all' || ownedCounts !== undefined || showHistory || !card.duplicateOf)
        && (view !== 'all' || ownedCounts !== undefined || showHistory || !presentationOnlyKeys.has(card.key))
        && (view !== 'favorites' || entry.favorite)
        && (view !== 'errata' || card.edition === 'errata')
        && (view !== 'albums' || !!activeAlbum?.versionKeys.includes(card.key))
        && (!series || card.series === series) && (!character || card.character === character)
        && (!search || [card.name, card.versionLabel, card.character, card.series, card.skin, card.workId].join(' ').toLocaleLowerCase().includes(search))
    })
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.versionLabel.localeCompare(b.versionLabel, 'zh-CN'))
    if (sort === 'rating') list.sort((a, b) => (snapshot.preferences[b.key]?.rating ?? 0) - (snapshot.preferences[a.key]?.rating ?? 0))
    if (sort === 'recent' && acquiredAtByKey) list.sort((a, b) => (acquiredAtByKey[b.key] ?? 0) - (acquiredAtByKey[a.key] ?? 0))
    return list
  }, [cards, snapshot.preferences, view, activeAlbum, query, series, character, sort, showHistory, ownedCounts, acquiredAtByKey, presentationOnlyKeys])
  const groups = sort === 'recent' && acquiredAtByKey
    ? [{ title: '最近获得', label: '最近获得', cards: filtered }]
    : [{ title: '收藏作品', label: '普通成品', cards: filtered.filter(card => card.edition !== 'errata') },
       { title: '错版卡', label: '错版卡', cards: filtered.filter(card => card.edition === 'errata') }]
  const ordered = detailOrder.map(key => cards.find(card => card.key === key)).filter((card): card is CardEditionDefinition => !!card)
  const selectedIndex = ordered.findIndex(card => card.key === selectedKey)

  async function mutate(operation: () => ReturnType<CardLibraryActions['setFavorite']>, success: string): Promise<boolean> {
    if (mutationLock.current || !writable || snapshot.pendingCount > 0) return false
    mutationLock.current = true
    setPending(true)
    setMessage('')
    setFailure(false)
    try {
      const result = await operation()
      if (result.status === 'rejected') {
        setMessage(result.message || '未能保存，请稍后重试。')
        setFailure(true)
        return false
      }
      setMessage(success)
      return true
    } catch {
      setMessage('未能保存，请稍后重试。输入仍保留在本页。')
      setFailure(true)
      return false
    } finally {
      mutationLock.current = false
      setPending(false)
    }
  }

  function openCard(card: CardEditionDefinition) {
    gridScroll.current = rootRef.current?.scrollTop ?? 0
    restoreFocus.current = card.key
    setDetailOrder(groups.flatMap(group => group.cards.map(item => item.key)))
    setSelectedKey(card.key)
    setMessage('')
  }
  function closeDetail() { setSelectedKey(null); setMessage('') }
  function selectVersion(key: string) {
    setSelectedKey(key)
    setMessage('')
    setDetailOrder(order => order.includes(key) ? order : [...order, key])
  }
  function step(delta: number) {
    const card = ordered[selectedIndex + delta]
    if (card) selectVersion(card.key)
  }
  useEffect(() => {
    if (selectedKey) {
      if (rootRef.current) rootRef.current.scrollTop = 0
      detailRef.current?.focus({ preventScroll: true })
    } else if (restoreFocus.current) {
      if (rootRef.current) rootRef.current.scrollTop = gridScroll.current
      ;(cardButtons.current.get(restoreFocus.current) ?? tabRef.current)?.focus({ preventScroll: true })
      restoreFocus.current = null
    }
  }, [selectedKey])
  useEffect(() => {
    if (selectedKey && !cards.some(card => card.key === selectedKey)) setSelectedKey(null)
  }, [cards, selectedKey])
  useEffect(() => {
    if (albumId && !albums.some(album => album.id === albumId)) setAlbumId(null)
  }, [albums, albumId])

  async function saveNote(key: string) {
    const draft = drafts[key]
    if (!draft || draft.value === entryFor(key).note) return true
    if (draft.base !== entryFor(key).note) { setFailure(true); setMessage('这条备注已在别处更新，请先选择要保留的内容。'); return false }
    const saved = await mutate(() => actions.setNote(key, draft.value), '备注已保存')
    if (saved) setDrafts(current => {
      if (current[key]?.value !== draft.value) return current
      const next = { ...current }; delete next[key]; return next
    })
    return saved
  }
  async function createAlbum() {
    const name = newAlbum.trim()
    if (!name) return
    if (await mutate(() => actions.saveAlbum({ id: crypto.randomUUID(), name, versionKeys: [] }), '收藏夹已创建')) setNewAlbum('')
  }
  const newAlbumForm = <form className="lumaCardLibraryInlineForm" onSubmit={event => { event.preventDefault(); void createAlbum() }}>
    <input aria-label="新收藏夹名称" placeholder="新收藏夹名称" maxLength={60} value={newAlbum} disabled={disabled} onChange={event => setNewAlbum(event.target.value)} />
    <button className="lumaCardLibraryButton" disabled={disabled || !newAlbum.trim()} type="submit">创建收藏夹</button>
  </form>
  const status = busy ? '正在保存…' : !writable ? snapshot.status === 'loading' ? '正在连接收藏数据；原图可正常浏览。' : '收藏保存暂不可用；原图可正常浏览，新的评价和收藏操作暂不可用。' : message || snapshot.issue?.message

  return <section className="lumaCardLibrary" ref={rootRef} aria-label="卡牌收藏" onKeyDown={event => {
    if (!selected || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Escape') { event.preventDefault(); closeDetail() }
    const element = event.target as HTMLElement
    if (element.closest('input, textarea, select, [contenteditable="true"]')) return
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
  }}>
    <div className="lumaCardLibraryContent">
      {(onOpenShop || onOpenExchange || onOpenDeviceArchive) && <header className="lumaCardLibraryTop">
        <nav className="lumaCardLibraryStoreLinks" aria-label="收藏与商店">{onOpenShop && <button className="lumaCardLibraryQuiet" onClick={onOpenShop}>卡包货架 ↗</button>}{onOpenExchange && <button className="lumaCardLibraryButton" onClick={onOpenExchange}>收集进度与兑换 ↗</button>}{onOpenDeviceArchive && <button type="button" className="lumaCardLibraryQuiet" onClick={onOpenDeviceArchive}>此设备的内容</button>}</nav>
      </header>}
      {status && <p className={`lumaCardLibraryStatus${failure && writable && !pending ? ' is-error' : ''}`} role="status" aria-live="polite">{status}</p>}
      {selected ? <section className="lumaCardLibraryDetail" ref={detailRef} tabIndex={-1} aria-label={`${titleOf(selected)}详情`}>
        <nav className="lumaCardLibraryDetailNav" aria-label="卡片浏览">
          <button className="lumaCardLibraryQuiet" onClick={closeDetail}>← 返回卡册</button>
          <div className="lumaCardLibraryPager"><button aria-label="上一张卡" disabled={selectedIndex <= 0} onClick={() => step(-1)}>‹</button><span>{selectedIndex + 1} / {ordered.length}</span><button aria-label="下一张卡" disabled={selectedIndex < 0 || selectedIndex >= ordered.length - 1} onClick={() => step(1)}>›</button></div>
        </nav>
        <div className="lumaCardLibraryDetailLayout">
          <div className="lumaCardLibraryArtStage">
            <LumaCardViewer key={selected.key} card={selected} onClose={closeDetail} />
          </div>
          <aside className="lumaCardLibraryDetails" aria-label="卡片资料与个人收藏">
            <p className="lumaCardLibrarySeries">{selected.series}</p>
            <h1>{selected.name}</h1><p className="lumaCardLibraryIdentity">{[selected.character, selected.skin].filter(Boolean).join(' · ')}</p>
            <div className="lumaCardLibraryVersion">{selected.rarity && <span className="lumaCardLibraryRarity" data-rarity={selected.rarity} aria-label={`稀有度 ${selected.rarity}`}>{selected.rarity}</span>}<span>{selected.versionLabel}</span>{selected.historicalRevision && <span className="lumaCardLibraryBadge">历史版本</span>}{selected.edition === 'errata' && <span className="lumaCardLibraryBadge">错版卡</span>}{ownedCounts && <span>持有 {ownedCounts[selected.key] ?? 0} 张</span>}</div>
            {cards.filter(card => card.workId === selected.workId).length > 1 && <><label htmlFor={`${id}-version`}>同作品版本</label><select id={`${id}-version`} value={selected.key} onChange={event => selectVersion(event.target.value)}>{cards.filter(card => card.workId === selected.workId).map(card => <option key={card.key} value={card.key}>{card.versionLabel}{card.historicalRevision ? ' · 历史版本' : ''}{card.edition === 'errata' ? ' · 错版' : ''}</option>)}</select></>}
            <div className="lumaCardLibraryDetailActions"><button className="lumaCardLibraryButton" aria-pressed={selectedEntry.favorite} disabled={disabled} onClick={() => void mutate(() => actions.setFavorite(selected.key, !selectedEntry.favorite), selectedEntry.favorite ? '已取消喜欢' : '已加入喜欢')}>{selectedEntry.favorite ? '♥ 已喜欢' : '♡ 喜欢'}</button></div>
            <label id={`${id}-rating`}>我的星级</label><div className="lumaCardLibraryRating" role="group" aria-labelledby={`${id}-rating`}>{[1, 2, 3, 4, 5].map(star => <button key={star} className={(selectedEntry.rating ?? 0) >= star ? 'is-filled' : ''} aria-label={`评为 ${star} 星`} aria-pressed={selectedEntry.rating === star} disabled={disabled} onClick={() => void mutate(() => actions.setRating(selected.key, star), '星级已保存')}>{(selectedEntry.rating ?? 0) >= star ? '★' : '☆'}</button>)}<button className="lumaCardLibraryQuiet" disabled={disabled || selectedEntry.rating === null} onClick={() => void mutate(() => actions.setRating(selected.key, null), '星级已清空')}>清空</button></div>
            <label htmlFor={`${id}-note`}>我的备注</label><textarea id={`${id}-note`} value={note} maxLength={2000} placeholder="记下喜欢的细节…" disabled={pending} onChange={event => { const value = event.target.value; setDrafts(current => ({ ...current, [selected.key]: { value, base: current[selected.key]?.base ?? selectedEntry.note } })) }} />
            {noteConflict && <div className="lumaCardLibraryNotice"><p>这条备注已在别处更新。你的输入仍保留。</p><button className="lumaCardLibraryButton" onClick={() => setDrafts(current => { const next = { ...current }; delete next[selected.key]; return next })}>使用已保存备注</button><button className="lumaCardLibraryButton" onClick={() => setDrafts(current => ({ ...current, [selected.key]: { value: note, base: selectedEntry.note } }))}>保留我的输入</button></div>}
            <div className="lumaCardLibraryNoteFooter"><span>{noteDirty ? '尚未保存' : '仅自己可见'} · {note.length}/2000</span><button className="lumaCardLibraryButton" disabled={disabled || !noteDirty || noteConflict} onClick={() => void saveNote(selected.key)}>保存备注</button></div>
            <div className="lumaCardLibraryMembership"><h2>加入收藏夹</h2>{albums.length ? albums.map(album => <label key={album.id}><input type="checkbox" checked={album.versionKeys.includes(selected.key)} disabled={disabled} onChange={event => void mutate(() => actions.saveAlbum({ ...album, versionKeys: event.target.checked ? [...new Set([...album.versionKeys, selected.key])] : album.versionKeys.filter(key => key !== selected.key) }), '收藏夹已更新')} /><span>{album.name}</span></label>) : <p>创建收藏夹，按自己的方式整理。</p>}{newAlbumForm}</div>
          </aside>
        </div>
      </section> : <>
        <div className="lumaCardLibraryHeading"><div><h1>卡牌收藏</h1></div><div className="lumaCardLibraryStats" aria-label={`${workCount} 款作品，${catalogCards.length} 个版本`}><div><strong>{workCount}</strong><span>款作品</span></div><div><strong>{catalogCards.length}</strong><span>个版本</span></div>{ownedCount !== undefined && <div aria-label={`持有 ${ownedCount} 张卡片`}><strong>{ownedCount}</strong><span>张卡片</span></div>}</div></div>
        {themeCollection}
        <nav className="lumaCardLibraryTabs" aria-label="收藏分类">{([['all', '全部', catalogCards.length], ['favorites', '喜欢', favoriteCount], ['errata', '错版', errataCount], ['albums', '我的收藏夹', albums.length]] as const).map(([key, label, count]) => <button key={key} ref={key === view ? tabRef : undefined} aria-pressed={view === key} onClick={() => { setView(key); setMessage('') }}>{label}<small>{count}</small></button>)}</nav>
        {view === 'albums' && <><div className="lumaCardLibraryAlbums"><div className="lumaCardLibraryAlbumList">{albums.map(album => <button className="lumaCardLibraryAlbum" key={album.id} aria-pressed={albumId === album.id} onClick={() => { setAlbumId(album.id); setRenameAlbum(null); setDeleteAlbum(null) }}><strong>{album.name}</strong><span>{cards.filter(card => album.versionKeys.includes(card.key)).length} 个版本</span></button>)}</div>{newAlbumForm}</div>{activeAlbum && <div className="lumaCardLibraryAlbumTools"><h2>{activeAlbum.name}</h2>{renameAlbum === activeAlbum.id ? <form className="lumaCardLibraryInlineForm" onSubmit={event => { event.preventDefault(); void mutate(() => actions.saveAlbum({ ...activeAlbum, name: renamedName.trim() }), '收藏夹已改名').then(ok => { if (ok) setRenameAlbum(null) }) }}><input aria-label="修改收藏夹名称" value={renamedName} maxLength={60} disabled={disabled} onChange={event => setRenamedName(event.target.value)} /><button className="lumaCardLibraryButton" disabled={disabled || !renamedName.trim()}>保存名称</button><button type="button" className="lumaCardLibraryQuiet" onClick={() => setRenameAlbum(null)}>取消</button></form> : <button className="lumaCardLibraryQuiet" disabled={disabled} onClick={() => { setRenameAlbum(activeAlbum.id); setRenamedName(activeAlbum.name) }}>改名</button>}<button className="lumaCardLibraryQuiet" disabled={disabled} onClick={() => setDeleteAlbum(activeAlbum.id)}>删除收藏夹</button></div>}{deleteAlbum && <div className="lumaCardLibraryNotice" role="alert"><p>删除“{albums.find(album => album.id === deleteAlbum)?.name}”？卡片、喜欢、星级和备注都会保留。</p><button className="lumaCardLibraryButton" disabled={disabled} onClick={() => void mutate(() => actions.removeAlbum(deleteAlbum), '收藏夹已删除，卡片仍保留').then(ok => { if (ok) setDeleteAlbum(null) })}>确认删除收藏夹</button><button className="lumaCardLibraryQuiet" onClick={() => setDeleteAlbum(null)}>取消</button></div>}</>}
        <div className="lumaCardLibraryToolbar"><label className="lumaCardLibrarySearch"><span className="lumaCardLibrarySr">搜索卡牌</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="m15 15 5 5" /></svg><input type="search" placeholder="搜索作品、角色或版本" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="筛选系列" value={series} onChange={event => setSeries(event.target.value)}><option value="">全部系列</option>{seriesOptions.map(value => <option key={value}>{value}</option>)}</select><select aria-label="筛选角色" value={character} onChange={event => setCharacter(event.target.value)}><option value="">全部角色</option>{characterOptions.map(value => <option key={value}>{value}</option>)}</select><select aria-label="卡牌排序" value={sort} onChange={event => setSort(event.target.value)}><option value="catalog">收录顺序</option>{acquiredAtByKey && <option value="recent">最近获得</option>}<option value="name">作品名称</option><option value="rating">我的星级</option></select>{view === 'all' && ownedCounts === undefined && (presentationOnlyKeys.size > 0 || cards.some(card => card.historicalRevision || card.duplicateOf)) && <label><input type="checkbox" checked={showHistory} onChange={event => setShowHistory(event.target.checked)} />显示历史版本</label>}<span className="lumaCardLibraryResultCount">{new Set(filtered.map(card => card.workId)).size} 款 · {filtered.length} 个版本</span></div>
        {filtered.length ? groups.map(({ title, label, cards: members }) => {
          return members.length ? <section className="lumaCardLibraryGroup" key={label} aria-label={label}><div className="lumaCardLibraryGroupHeading"><h2>{title}</h2><span>{members.length} 个版本{label === '错版卡' ? ' · 保留原版' : ''}</span></div><div className="lumaCardLibraryGrid">{members.map(card => {
            const entry = entryFor(card.key)
            return <article className={`lumaCardLibraryCard${card.width > card.height ? ' is-landscape' : ''}`} key={card.key} data-edition-key={card.key}><button className="lumaCardLibraryOpen" ref={element => { if (element) cardButtons.current.set(card.key, element); else cardButtons.current.delete(card.key) }} aria-label={`查看${titleOf(card)}`} onClick={() => openCard(card)}><Artwork card={card} /></button><div className="lumaCardLibraryCardCaption"><div><h3>{card.name}</h3><p>{card.character || card.series}</p></div><button className="lumaCardLibraryHeart" aria-label={`${entry.favorite ? '取消喜欢' : '喜欢'}${titleOf(card)}`} aria-pressed={entry.favorite} disabled={disabled} onClick={() => void mutate(() => actions.setFavorite(card.key, !entry.favorite), entry.favorite ? '已取消喜欢' : '已加入喜欢')}><Heart filled={entry.favorite} /></button></div><div className="lumaCardLibraryVersion">{card.rarity && <span className="lumaCardLibraryRarity" data-rarity={card.rarity} aria-label={`稀有度 ${card.rarity}`}>{card.rarity}</span>}<span>{card.versionLabel}</span>{card.edition === 'errata' && <span className="lumaCardLibraryBadge">错版</span>}{ownedCounts && <span>持有 {ownedCounts[card.key] ?? 0} 张</span>}{entry.rating !== null && <span className="lumaCardLibraryTinyStars" aria-label={`我的星级 ${entry.rating} 星`}>{'★'.repeat(entry.rating)}</span>}</div></article>
          })}</div></section> : null
        }) : cards.length === 0 && ownedCount !== undefined ? <div className="lumaCardLibraryEmpty"><h2>还没有卡片</h2><p>从卡包开启第一张收藏</p>{onOpenShop && <button className="lumaCardLibraryButton" type="button" onClick={onOpenShop}>去卡包商店</button>}</div> : <div className="lumaCardLibraryEmpty"><h2>{view === 'albums' && !activeAlbum ? albums.length ? '选择一个收藏夹' : '收藏，从你的分类开始' : view === 'favorites' && !query && !series && !character ? '还没有喜欢的卡片' : '没有找到卡片'}</h2><p>{view === 'albums' && !activeAlbum ? '创建或打开收藏夹，再从卡片详情里加入喜欢的版本。' : query || series || character ? '试试其他关键词，或清除筛选。' : '所有已完成的版本都会保留在“全部”中。'}</p>{(query || series || character) && <button className="lumaCardLibraryQuiet" onClick={() => { setQuery(''); setSeries(''); setCharacter('') }}>清除筛选</button>}</div>}
      </>}
    </div>
  </section>
}
