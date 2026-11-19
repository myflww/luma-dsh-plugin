import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, Search, Sparkles, X } from 'lucide-react'
import { PREVIEW_CARD_CATALOG } from '../shared/preview-card-catalog.ts'
import type { CardEditionDefinition } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/cardLibraryTypes.ts'
import { LumaCardViewer } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/LumaCardViewer.tsx'
import { getPackPool } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { LOCAL_PACKS } from '../shared/local-collection-domain.ts'
import { OPENABLE_PACK_SKINS, PACK_REFERENCE_SKINS, type PackSkin } from '../shared/pack-skin-catalog.ts'
import { PackOpeningScene } from './PackOpeningScene.tsx'
import './PackCollectionPreview.css'

const characters = [...new Set(PREVIEW_CARD_CATALOG.map(card => card.character))]
const series = [...new Set(PREVIEW_CARD_CATALOG.map(card => card.series))]
const editionLabel = (card: CardEditionDefinition) => card.historicalRevision ? '历史版本' : card.edition === 'errata' ? '错版' : '正版'
const matchesEdition = (card: CardEditionDefinition, value: string) => value === 'all' || (value === 'historical'
  ? !!card.historicalRevision : value === 'errata' ? card.edition === 'errata' : card.edition === 'standard' && !card.historicalRevision)
const matchesRarity = (card: CardEditionDefinition, value: string) => value === 'all' || (value === 'unrated' ? !card.rarity : card.rarity === value)
const initialKeys = () => LOCAL_PACKS.flatMap(pack => getPackPool(pack.id).slice(0, 1).map(card => card.key)).slice(0, 5)

/** Complete, read-only art browser. Catalog selection is never an acquisition. */
export function PackCollectionPreview({ onClose }: { onClose?(): void }) {
  const page = useRef<HTMLElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose
  const [skinId, setSkinId] = useState(OPENABLE_PACK_SKINS[0]!.id)
  const [query, setQuery] = useState('')
  const [character, setCharacter] = useState('all')
  const [seriesId, setSeriesId] = useState('all')
  const [rarity, setRarity] = useState('all')
  const [edition, setEdition] = useState('all')
  const [poolId, setPoolId] = useState('all')
  const [selected, setSelected] = useState<readonly string[]>(initialKeys)
  const [opening, setOpening] = useState(false)
  const [detail, setDetail] = useState<CardEditionDefinition>()
  const [material, setMaterial] = useState<PackSkin>()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!onCloseRef.current) return
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; backButton.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector('.lumaOpeningBackdrop, .lumaPackPreviewDetailBackdrop')) return
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current?.(); return }
      if (event.key !== 'Tab') return
      const targets = [...page.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? []]
      const first = targets[0], last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus() }
  }, [])
  const skin = OPENABLE_PACK_SKINS.find(row => row.id === skinId) ?? OPENABLE_PACK_SKINS[0]!
  const selectedCards = selected.flatMap(key => { const card = PREVIEW_CARD_CATALOG.find(row => row.key === key); return card ? [card] : [] })
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    const pool = poolId === 'all' ? null : new Set(getPackPool(poolId).map(card => card.key))
    return PREVIEW_CARD_CATALOG.filter(card => (!pool || pool.has(card.key))
      && (character === 'all' || card.character === character)
      && (seriesId === 'all' || card.series === seriesId)
      && matchesRarity(card, rarity)
      && matchesEdition(card, edition)
      && (!needle || [card.name, card.character, card.series, card.workId, card.revision, card.versionLabel, card.skin, card.craftLabel].some(text => text?.toLocaleLowerCase('zh-CN').includes(needle))))
  }, [query, character, seriesId, rarity, edition, poolId])
  function toggle(key: string) {
    setNotice('')
    if (selected.includes(key)) { setSelected(keys => keys.filter(value => value !== key)); return }
    if (selected.length >= 5) { setNotice('一次可以预览 1–5 张卡片，先移除一张再选择。'); return }
    setSelected(keys => [...keys, key])
  }
  function resetFilters() { setQuery(''); setCharacter('all'); setSeriesId('all'); setRarity('all'); setEdition('all'); setPoolId('all') }
  return <main ref={page} className={`lumaPackPreview${onClose ? ' is-modal' : ''}`} role={onClose ? 'dialog' : undefined} aria-modal={onClose ? true : undefined} aria-label="Luma 全量卡包皮肤与卡牌预览">
    <header className="lumaPackPreviewHeader"><div><span className="lumaPackPreviewEyebrow"><Sparkles size={14} /> LUMA · COLLECTION ATELIER</span><h1>把每一种心动，都摊开看看</h1><p>{OPENABLE_PACK_SKINS.length} 款实体卡包 · {PACK_REFERENCE_SKINS.length} 份图案与卡背 · {PREVIEW_CARD_CATALOG.length} 个卡牌版本</p></div>
      {onClose && <button ref={backButton} type="button" className="lumaPackPreviewBack" onClick={onClose}><ArrowLeft size={16} />返回卡包店</button>}</header>

    <section className="lumaPackPreviewHero" aria-labelledby="luma-pack-skin-title" data-theme={skin.theme}>
      <div className="lumaPackPreviewFullPack"><img key={skin.id} src={skin.openingArtworkUrl ?? skin.artworkUrl} alt={`${skin.name}完整包装图`} /></div>
      <div className="lumaPackPreviewHeroCopy"><span className="lumaPackPreviewEyebrow">YOUR NEXT LITTLE JOY</span><h2 id="luma-pack-skin-title">{skin.name}</h2><p>喜欢哪一款，就让它成为下一次惊喜的外衣。下方收录全部现有卡牌，选好卡面后，就可以体验拆封和展开。</p>
        <div className="lumaPackPreviewSelection" aria-label="本次开包预览所选卡片">{selectedCards.length ? selectedCards.map(card => <button type="button" key={card.key} aria-label={`移除预览卡片：${card.name}`} title={`移除 ${card.name}`} onClick={() => toggle(card.key)}><img src={card.frontUrl} alt={card.name} /><span><X size={12} /></span></button>) : <span className="lumaPackPreviewNoSelection">在下方挑选 1–5 张喜欢的卡片</span>}</div>
        <div className="lumaPackPreviewHeroActions"><button className="lumaPackPreviewPrimary" type="button" disabled={!selected.length} onClick={() => setOpening(true)}>体验这款开包<Sparkles size={16} /></button><button type="button" onClick={() => document.getElementById('luma-preview-cards')?.scrollIntoView({ behavior: 'smooth' })}>挑选卡面<ArrowRight size={15} /></button></div>
        <p className="lumaPackPreviewNote">素材预览不消耗卡包或星币，也不会新增持有记录。历史版本一并保留。</p>
      </div>
    </section>

    <section className="lumaPackPreviewSkins" aria-label="全部卡包皮肤"><div className="lumaPackPreviewSectionTitle"><h2>挑选卡包</h2><span>{OPENABLE_PACK_SKINS.length} 款包装</span></div>
      <div className="lumaPackPreviewSkinGrid">{OPENABLE_PACK_SKINS.map(row => <button type="button" className="lumaPackPreviewSkin" key={row.id} aria-label={`选择卡包皮肤：${row.name}`} aria-pressed={skin.id === row.id} onClick={() => setSkinId(row.id)}>
        <span className="lumaPackPreviewSkinImage"><img src={row.openingArtworkUrl ?? row.artworkUrl} alt={row.name} loading="lazy" /></span><span className="lumaPackPreviewSkinName">{row.name}{skin.id === row.id && <Check size={13} />}</span>
      </button>)}</div>
    </section>

    <section className="lumaPackPreviewReferences" aria-label="图案与卡背参考"><div className="lumaPackPreviewSectionTitle"><h2>图案与卡背</h2><span>{PACK_REFERENCE_SKINS.length} 份原始素材</span></div>
      <div className="lumaPackPreviewSkinGrid">{PACK_REFERENCE_SKINS.map(row => <button type="button" className="lumaPackPreviewMaterial" key={row.id} aria-label={`查看参考素材：${row.name}`} onClick={() => setMaterial(row)}>
        <span className="lumaPackPreviewSkinImage"><img src={row.artworkUrl} alt={row.name} loading="lazy" /></span><span className="lumaPackPreviewSkinName">{row.name}</span><small>{row.kind === 'card-back' ? '卡背 · 查看原图' : '金属图案 · 查看原图'}</small>
      </button>)}</div>
    </section>

    <section id="luma-preview-cards" className="lumaPackPreviewLibrary" aria-labelledby="luma-preview-card-title"><div className="lumaPackPreviewSectionTitle"><div><span className="lumaPackPreviewEyebrow">EVERY ENCOUNTER, EVERY EDITION</span><h2 id="luma-preview-card-title">全部卡牌，一张也不落下</h2></div><span aria-live="polite">{filtered.length} / {PREVIEW_CARD_CATALOG.length} 个版本</span></div>
      <div className="lumaPackPreviewFilters"><label className="lumaPackPreviewSearch"><Search size={16} /><input aria-label="搜索全部卡牌" value={query} placeholder="搜索卡名、角色、系列、编号…" onChange={event => setQuery(event.target.value)} /></label>
        <label><span>角色</span><select aria-label="筛选角色" value={character} onChange={event => setCharacter(event.target.value)}><option value="all">全部角色</option>{characters.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span>系列</span><select aria-label="筛选系列" value={seriesId} onChange={event => setSeriesId(event.target.value)}><option value="all">全部系列</option>{series.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span>品质</span><select aria-label="筛选品质" value={rarity} onChange={event => setRarity(event.target.value)}><option value="all">全部品质</option>{['N', 'R', 'SR', 'SSR'].map(tier => <option key={tier} value={tier}>{tier}</option>)}<option value="unrated">原作 · 未标品质</option></select></label>
        <label><span>版本</span><select aria-label="筛选版本" value={edition} onChange={event => setEdition(event.target.value)}><option value="all">全部版本</option><option value="standard">当前正版</option><option value="errata">错版</option><option value="historical">历史版本</option></select></label>
        <label><span>卡池</span><select aria-label="筛选卡包卡池" value={poolId} onChange={event => setPoolId(event.target.value)}><option value="all">全部卡牌</option>{LOCAL_PACKS.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>
      </div>
      <div className="lumaPackPreviewResults"><p>已选 {selected.length} / 5 张用于开包预览</p><div><button type="button" disabled={!selected.length} onClick={() => { setSelected([]); setNotice('') }}>清空所选</button><button type="button" onClick={resetFilters}>重置筛选</button></div></div>
      {notice && <p className="lumaPackPreviewNotice" role="status">{notice}</p>}
      {filtered.length ? <div className="lumaPackPreviewCardGrid">{filtered.map(card => {
        const chosen = selected.includes(card.key)
        return <article className={`lumaPackPreviewCard${chosen ? ' is-selected' : ''}`} key={card.key} data-edition-key={card.key}>
          <button type="button" className="lumaPackPreviewCardArt" aria-label={`细看卡片：${card.name} · ${card.versionLabel}`} onClick={() => setDetail(card)}><img src={card.frontUrl} alt={card.alt} loading="lazy" /><span>{card.rarity ?? '原作'}</span></button>
          <div className="lumaPackPreviewCardCopy"><div className="lumaPackPreviewCardMeta"><span>{card.character}</span><small>{editionLabel(card)}</small></div><h3>{card.name}</h3><p>{card.versionLabel}</p><small className="lumaPackPreviewCardKey">{card.workId} · {card.revision}</small>
            <div className="lumaPackPreviewCardActions"><button type="button" onClick={() => setDetail(card)} aria-label={`查看完整卡片与工艺：${card.key}`}><Eye size={14} />细看</button><button type="button" className={chosen ? 'is-selected' : ''} aria-pressed={chosen} aria-label={`${chosen ? '移除' : '加入'}开包预览：${card.key}`} onClick={() => toggle(card.key)}>{chosen ? <><Check size={14} />已选</> : '选入预览'}</button></div>
          </div>
        </article>
      })}</div> : <div className="lumaPackPreviewEmpty"><h3>这一页还没有符合的卡片</h3><p>换个关键词，或看看全部版本。</p><button type="button" onClick={resetFilters}>显示全部卡牌</button></div>}
    </section>
    <footer className="lumaPackPreviewFooter"><span>LUMA · 每一种相遇，都值得好好收藏</span><small>作品浏览与开包演示 · 不代表持有</small></footer>
    <aside className="lumaPackPreviewDock" aria-label="开包预览快捷操作"><div><span>{skin.name}</span><small>已选 {selected.length} 张卡片</small></div><button className="lumaPackPreviewPrimary" type="button" disabled={!selected.length} onClick={() => setOpening(true)}>预览开包<ArrowRight size={15} /></button></aside>
    {opening && <PackOpeningScene preview={{ cardKeys: selected, packId: skin.packId, skin }} onClose={() => setOpening(false)} />}
    {detail && <PreviewCardDetail card={detail} onClose={() => setDetail(undefined)} />}
    {material && <PreviewMaterialDetail material={material} onClose={() => setMaterial(undefined)} />}
  </main>
}

function PreviewMaterialDetail({ material, onClose }: { material: PackSkin; onClose(): void }) {
  const close = useRef<HTMLButtonElement>(null)
  const callback = useRef(onClose); callback.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; close.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); callback.current() }
      if (event.key === 'Tab') { event.preventDefault(); close.current?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus() }
  }, [])
  return <div className="lumaPackPreviewDetailBackdrop"><section role="dialog" aria-modal="true" aria-label={`${material.name}参考原图`} className="lumaPackPreviewDetail lumaPackPreviewMaterialDetail"><header><div><span>{material.kind === 'card-back' ? '卡背参考' : '金属图案参考'}</span><h2>{material.name}</h2><p>保留原始图案与比例 · 参考素材不可拆封</p></div><button ref={close} type="button" aria-label="关闭参考原图" onClick={onClose}><X size={20} /></button></header><img src={material.artworkUrl} alt={`${material.name}原始参考图`} /></section></div>
}

function PreviewCardDetail({ card, onClose }: { card: CardEditionDefinition; onClose(): void }) {
  const dialog = useRef<HTMLElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const callback = useRef(onClose); callback.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; close.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); callback.current(); return }
      if (event.key !== 'Tab') return
      const targets = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"], select, input') ?? []]
      const first = targets[0], last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus() }
  }, [])
  return <div className="lumaPackPreviewDetailBackdrop"><section ref={dialog} role="dialog" aria-modal="true" aria-label={`${card.name}完整卡片与工艺`} className="lumaPackPreviewDetail"><header><div><span>{card.character} · {editionLabel(card)}</span><h2>{card.name}</h2><p>{card.versionLabel} · {card.key}</p></div><button ref={close} type="button" aria-label="关闭卡片查看" onClick={onClose}><X size={20} /></button></header><LumaCardViewer card={card} onClose={onClose} /></section></div>
}
