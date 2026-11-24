import { useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowUpRight, BookOpen, Layers3, ShoppingBag, UsersRound } from 'lucide-react'
import { LOCAL_PACKS } from '../shared/local-collection-domain.ts'
import { PackFieldGuide } from './PackFieldGuide.tsx'
import './CardsPage.css'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { LumaCardLibrarySurface } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/LumaCardLibrarySurface.tsx'
import { SettingsBackedCardLibraryStore } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/SettingsBackedCardLibraryStore.ts'
import { PREVIEW_CARD_CATALOG } from '../shared/preview-card-catalog.ts'
import { CARD_LIBRARY_SETTINGS_NAMESPACE, decodeCardLibrarySettings, type CardLibrarySettings } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/card-library-settings.ts'
import type { LocalCollectionRuntime } from './local-collection-store.ts'
import { localAlbumStyle } from './CollectionHub.tsx'
import { CompanionRewards } from './CompanionRewards.tsx'

export interface CardsPageRuntime {
  readonly store: SettingsBackedCardLibraryStore
  dispose(): void
}

/** The DSH apply lifetime owns this adapter, independently of page navigation. */
export function createCardsPageRuntime(ctx: ClientContext): CardsPageRuntime {
  const store = new SettingsBackedCardLibraryStore(ctx.settingsScope.bind<CardLibrarySettings>({
    namespace: CARD_LIBRARY_SETTINGS_NAMESPACE,
    decode: decodeCardLibrarySettings,
  }), PREVIEW_CARD_CATALOG)
  store.load()
  return { store, dispose: () => { store.dispose() } }
}

/** Browsing and personal annotations never issue cards or invent ownership. */
export function CardsPage({ runtime, collection, initialView = 'owned', onOpenShop }: { runtime: CardsPageRuntime; collection: LocalCollectionRuntime;
  initialView?: 'catalog' | 'owned' | 'rewards'; onOpenShop(packId?: string): void }) {
  const { store } = runtime
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const owned = useSyncExternalStore(collection.store.subscribe, collection.store.getSnapshot, collection.store.getSnapshot)
  const [view, setView] = useState(initialView)
  const cards = useMemo(() => PREVIEW_CARD_CATALOG.filter(card => owned.ownedCounts[card.key]), [owned.ownedCounts])
  const acquiredAtByKey = useMemo(() => {
    const times: Record<string, number> = {}
    for (const card of owned.cards) times[card.versionKey] = Math.max(times[card.versionKey] ?? 0, card.acquiredAt)
    return times
  }, [owned.cards])
  const sealed = owned.packs.filter(pack => pack.openedAt === undefined).length
  return <section className="lumaPluginCards lumaLocalAlbumSkin lumaAlbumPage" style={localAlbumStyle(owned.albumSkin)} aria-label="Luma 卡牌图鉴与个人收藏">
    <aside className="lumaAlbumBar"><div className="lumaAlbumBrand"><BookOpen size={19} aria-hidden="true"/><strong>收藏馆</strong></div><nav aria-label="图鉴与持有卡册">
      <button type="button" aria-pressed={view === 'owned'} onClick={() => setView('owned')}><BookOpen size={16} aria-hidden="true"/>我的卡册</button>
      <button type="button" aria-pressed={view === 'catalog'} onClick={() => setView('catalog')}><Layers3 size={16} aria-hidden="true"/>卡池图鉴</button>
      <button type="button" aria-pressed={view === 'rewards'} onClick={() => setView('rewards')}><UsersRound size={16} aria-hidden="true"/>伙伴与空间</button>
    </nav><button className="lumaAlbumShop" type="button" onClick={() => onOpenShop()}><ShoppingBag size={15} aria-hidden="true"/>卡包店</button></aside>
    <div className="lumaAlbumCanvas">
    {owned.status !== 'ready' ? <p className="lumaAlbumLoading" role="status">{owned.status === 'loading' ? '正在打开你的卡册…' : '暂时无法读取这个档案的收藏，请重新连接 DSH。'}</p>
      : view === 'rewards' ? <div className="lumaAlbumBody"><CompanionRewards runtime={collection} onFindPack={onOpenShop}/></div>
      : view === 'catalog' ? <div className="lumaAlbumBody"><PackFieldGuide collection={owned} onOpenShop={onOpenShop}/></div>
      : <>
        <header className="lumaAlbumSummary"><h1>我的卡册</h1>
          {cards.length > 0 && <span>{cards.length} 款 · {owned.cards.length} 张</span>}
        </header>
        {cards.length ? <LumaCardLibrarySurface cards={cards} snapshot={snapshot} actions={store}
          ownedCount={owned.cards.length} ownedCounts={owned.ownedCounts} acquiredAtByKey={acquiredAtByKey} />
          : <div className="lumaAlbumBody"><div className="lumaAlbumFirstPage">
            <div className="lumaAlbumFirstArt" aria-hidden="true">{LOCAL_PACKS.slice(0,3).map(pack=><img key={pack.id} src={pack.artworkUrl} alt="" />)}</div>
            <div className="lumaAlbumFirstText"><h2>{sealed ? '还有 ' + sealed + ' 包待拆' : owned.discoveredKeys.size ? '卡片已兑换' : '翻开你的第一张卡'}</h2>
              {!sealed && owned.discoveredKeys.size > 0 && <p>已点亮的卡仍可在图鉴中查看。</p>}
              <button type="button" onClick={() => onOpenShop(sealed ? 'sealed' : undefined)}>{sealed ? '打开未开封卡包' : '去卡包店'} <ArrowUpRight size={16}/></button></div>
          </div></div>}
      </>}
    </div>
  </section>
}
