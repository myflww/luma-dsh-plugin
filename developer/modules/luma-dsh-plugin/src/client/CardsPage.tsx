import { useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowUpRight, BookOpen, Layers3, ShoppingBag, UsersRound } from 'lucide-react'
import { LOCAL_PACKS } from '../shared/local-collection-domain.ts'
import { PackFieldGuide } from './PackFieldGuide.tsx'
import './CardsPage.css'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { LumaCardLibrarySurface } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/LumaCardLibrarySurface.tsx'
import { SettingsBackedCardLibraryStore } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/SettingsBackedCardLibraryStore.ts'
import { PRODUCTION_CARD_CATALOG } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/productionCardCatalog.ts'
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
  }), PRODUCTION_CARD_CATALOG)
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
  const cards = useMemo(() => PRODUCTION_CARD_CATALOG.filter(card => owned.ownedCounts[card.key]), [owned.ownedCounts])
  const acquiredAtByKey = useMemo(() => {
    const times: Record<string, number> = {}
    for (const card of owned.cards) times[card.versionKey] = Math.max(times[card.versionKey] ?? 0, card.acquiredAt)
    return times
  }, [owned.cards])
  const sealed = owned.packs.filter(pack => pack.openedAt === undefined).length
  return <section className="lumaPluginCards lumaLocalAlbumSkin lumaAlbumPage" style={localAlbumStyle(owned.albumSkin)} aria-label="Luma 卡牌图鉴与个人收藏">
    <div className="lumaAlbumBar"><nav aria-label="图鉴与持有卡册">
      <button type="button" aria-pressed={view === 'owned'} onClick={() => setView('owned')}><BookOpen size={16}/>我的卡册</button>
      <button type="button" aria-pressed={view === 'catalog'} onClick={() => setView('catalog')}><Layers3 size={16}/>卡池图鉴</button>
      <button type="button" aria-pressed={view === 'rewards'} onClick={() => setView('rewards')}><UsersRound size={16}/>伙伴与空间</button>
    </nav><button className="lumaAlbumShop" type="button" onClick={() => onOpenShop()}><ShoppingBag size={15}/>卡包店</button></div>
    {owned.status !== 'ready' ? <p className="lumaAlbumLoading" role="status">{owned.status === 'loading' ? '正在打开你的卡册…' : '暂时无法读取这个档案的收藏，请重新连接 DSH。'}</p>
      : view === 'rewards' ? <div className="lumaAlbumBody"><CompanionRewards runtime={collection} onFindPack={onOpenShop}/></div>
      : view === 'catalog' ? <div className="lumaAlbumBody"><PackFieldGuide collection={owned} onOpenShop={onOpenShop}/></div>
      : <>
        <header className="lumaAlbumSummary"><div><h1>我的卡册</h1><p>{owned.albumSkin.name}装帧</p></div>
          <dl><div><dt>持有卡片</dt><dd>{owned.cards.length}<small>张</small></dd></div><div><dt>已开卡包</dt><dd>{owned.openedCards.length}<small>包</small></dd></div></dl>
        </header>
        {cards.length ? <LumaCardLibrarySurface cards={cards} snapshot={snapshot} actions={store} onBack={() => {}}
          ownedCount={owned.cards.length} ownedCounts={owned.ownedCounts} acquiredAtByKey={acquiredAtByKey} />
          : <div className="lumaAlbumBody"><div className="lumaAlbumFirstPage">
            <div className="lumaAlbumFirstArt" aria-hidden="true"><div className="lumaAlbumBook"><i/><span/></div><img src={LOCAL_PACKS[0]!.artworkUrl} alt="" /></div>
            <div className="lumaAlbumFirstText"><h2>{sealed ? '有一包相遇，等你拆开' : owned.openedCards.length ? '这些相遇，已经变成了伙伴' : '翻开你的第一张卡'}</h2>
              <p>{sealed ? '你还有 '+sealed+' 包未开封卡包。开包后，卡片就会出现在这里。' : owned.openedCards.length ? '已兑换的卡保留在图鉴中。下一张收藏，从开包开始。' : '领取新册礼，挑一包喜欢的卡。亲手拆开的第一张，就是这本卡册的开始。'}</p>
              <button type="button" onClick={() => onOpenShop(sealed ? 'sealed' : undefined)}>{sealed ? '打开未开封卡包' : '去卡包店'} <ArrowUpRight size={16}/></button></div>
          </div></div>}
      </>}
  </section>
}
