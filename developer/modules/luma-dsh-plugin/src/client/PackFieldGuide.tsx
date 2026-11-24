import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, BookOpen, History, Layers3, LockKeyhole, Search, X } from 'lucide-react'
import type { CardEditionDefinition } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/cardLibraryTypes.ts'
import { LumaCardViewer } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/LumaCardViewer.tsx'
import { getPackIdForCard } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { getVisibleGuideCards, LOCAL_PACKS, type LocalCollectionProjection } from '../shared/local-collection-domain.ts'
import { PACK_REFERENCE_SKINS } from '../shared/pack-skin-catalog.ts'

const pageSize = 24
const packBacks = new Map(PACK_REFERENCE_SKINS.filter(skin => skin.kind === 'card-back').map(skin => [skin.packId, skin.artworkUrl]))

function GuideCardDetail({ card, onClose }: { card: CardEditionDefinition; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (typeof node.showModal === 'function') node.showModal()
    else node.setAttribute('open', '')
    node.querySelector('button')?.focus()
    return () => { if (node.open) node.close?.() }
  }, [])
  return <dialog ref={dialog} className="lumaGuideDetail" aria-label={card.name + '详情'} onCancel={onClose}>
    <header><div><h2>{card.name}</h2><p>{card.character} · {card.versionLabel}</p></div>
      <button type="button" aria-label="关闭卡片详情" onClick={onClose}><X size={19}/></button>
    </header>
    <LumaCardViewer card={card} onClose={onClose}/>
  </dialog>
}

export function PackFieldGuide({ collection, onOpenShop }: { collection: LocalCollectionProjection; onOpenShop(id?: string): void }) {
  const [chosen, setChosen] = useState('')
  const [search, setSearch] = useState('')
  const [ownership, setOwnership] = useState('all')
  const [rarity, setRarity] = useState('')
  const [visible, setVisible] = useState(pageSize)
  const [detailKey, setDetailKey] = useState('')
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const guideId = useId()
  const volumes = [
    { id: '', name: '全部卡池', art: '', cards: getVisibleGuideCards(collection) },
    ...LOCAL_PACKS.map(pack => ({ id: pack.id, name: pack.name, art: pack.artworkUrl, cards: getVisibleGuideCards(collection, pack.id) })),
  ]
  const volume = volumes.find(row => row.id === chosen) ?? volumes[0]!
  const discovered = collection.discoveredKeys
  const query = search.trim().toLocaleLowerCase()
  const matching = volume.cards.filter(card => {
    if (rarity && card.rarity !== rarity) return false
    if (ownership === 'held' && !collection.ownedCounts[card.key]) return false
    if (ownership === 'seen' && !discovered.has(card.key)) return false
    if (ownership === 'unseen' && discovered.has(card.key)) return false
    return !query || [card.key, card.name, card.character, card.versionLabel, card.rarity].join(' ').toLocaleLowerCase().includes(query)
  }).sort((left, right) => Number(discovered.has(right.key)) - Number(discovered.has(left.key)))
  const detail = detailKey && discovered.has(detailKey) && volume.cards.find(card => card.key === detailKey)
  function clearFilters() {
    setOwnership('all')
    setRarity('')
    setSearch('')
    setVisible(pageSize)
  }
  function closeDetail() {
    setDetailKey('')
    requestAnimationFrame(() => detailTrigger.current?.focus({ preventScroll: true }))
  }
  return <section className="lumaGuide" aria-label="卡池图鉴">
    <header className="lumaGuideHeader"><h2>卡池图鉴</h2>
      <button type="button" onClick={() => onOpenShop(chosen || undefined)}>{chosen ? '前往' + volume.name : '去卡包店'}<ArrowUpRight size={15} aria-hidden="true"/></button>
    </header>
    <nav className="lumaGuideVolumes" aria-label="选择卡池">
      {volumes.map(row => {
        const seen = row.cards.filter(card => discovered.has(card.key)).length
        return <button type="button" key={row.id} aria-pressed={row.id === chosen} onClick={() => { setChosen(row.id); setVisible(pageSize) }}>
          {row.art ? <img src={row.art} alt=""/> : <Layers3 size={25} aria-hidden="true"/>}
          <span><strong>{row.name}</strong><small aria-label={'已点亮 ' + seen + ' / ' + row.cards.length}>{seen} / {row.cards.length}</small>
            <progress aria-hidden="true" max={Math.max(1, row.cards.length)} value={seen}/></span>
        </button>
      })}
    </nav>
    <div className="lumaGuideFilter">
      <label><Search size={15} aria-hidden="true"/><input type="search" aria-label="搜索卡池版本" placeholder="卡名、角色或编号" value={search} onChange={e => { setSearch(e.target.value); setVisible(pageSize) }}/></label>
      <select aria-label="筛选点亮状态" value={ownership} onChange={e => { setOwnership(e.target.value); setVisible(pageSize) }}><option value="all">全部状态</option><option value="held">当前持有</option><option value="seen">已点亮</option><option value="unseen">未获得</option></select>
      <select aria-label="筛选卡池稀有度" value={rarity} onChange={e => { setRarity(e.target.value); setVisible(pageSize) }}><option value="">全部稀有度</option>{['N', 'R', 'SR', 'SSR'].map(value => <option key={value}>{value}</option>)}</select>
      {(query || rarity || ownership !== 'all') && <button type="button" onClick={clearFilters}>清除筛选</button>}
      <output aria-live="polite">{matching.length} 款</output>
    </div>
    <ul className="lumaGuideSlots">{matching.slice(0, visible).map(card => {
      const lit = discovered.has(card.key)
      const copies = collection.ownedCounts[card.key] ?? 0
      const art = lit ? card.frontUrl : packBacks.get(getPackIdForCard(card))
      const status = lit ? copies ? '持有 ' + copies + ' 张' : '已点亮 · 已兑换' : '未获得'
      const face = <>
        {art && <img src={art} alt="" loading="lazy" decoding="async"/>}
        <span className="lumaGuideCardState" title={status}>
          {lit ? copies ? <><BookOpen size={13}/><b>×{copies}</b></> : <History size={14}/> : <LockKeyhole size={13}/>}
          <span className="lumaGuideSr" id={guideId + card.key}>{status}</span>
        </span>
      </>
      return <li key={card.key} data-discovered={lit} data-edition-key={card.key}>
        {lit ? <button type="button" className="lumaGuideStamp" aria-haspopup="dialog" aria-describedby={guideId + card.key} aria-label={'查看' + card.name + ' · ' + card.versionLabel} onClick={e => { detailTrigger.current = e.currentTarget; setDetailKey(card.key) }}>{face}</button>
          : <div className="lumaGuideStamp">{face}</div>}
        <div className="lumaGuideCaption"><span className="lumaGuideRarity" data-rarity={card.rarity}>{card.rarity}</span><strong>{card.name}</strong></div>
        {(card.edition === 'errata' || card.historicalRevision) && <small className="lumaGuideEdition">{card.edition === 'errata' ? '错版' : '历史版本'}</small>}
      </li>
    })}</ul>
    {!matching.length && <p className="lumaGuideEmpty" role="status">没有符合条件的卡片</p>}
    {matching.length > visible && <button className="lumaGuideMore" type="button" onClick={() => setVisible(visible + pageSize)}>查看更多（{matching.length - visible}）</button>}
    {detail && <GuideCardDetail key={detail.key} card={detail} onClose={closeDetail}/>}
  </section>
}
