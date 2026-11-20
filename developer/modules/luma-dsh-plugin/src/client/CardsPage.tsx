import { useMemo, useState, useSyncExternalStore } from 'react'
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
export function CardsPage({ runtime, collection, initialView = 'catalog', onOpenShop }: { runtime: CardsPageRuntime; collection: LocalCollectionRuntime;
  initialView?: 'catalog' | 'owned' | 'rewards'; onOpenShop(packId?: string): void }) {
  const { store } = runtime
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const owned = useSyncExternalStore(collection.store.subscribe, collection.store.getSnapshot, collection.store.getSnapshot)
  const [view, setView] = useState(initialView)
  const cards = useMemo(() => view === 'owned' ? PRODUCTION_CARD_CATALOG.filter(card => owned.ownedCounts[card.key]) : PRODUCTION_CARD_CATALOG, [view, owned.ownedCounts])
  const acquiredAtByKey = useMemo(() => {
    const times: Record<string, number> = {}
    for (const card of owned.cards) times[card.versionKey] = Math.max(times[card.versionKey] ?? 0, card.acquiredAt)
    return times
  }, [owned.cards])
  return <section className="lumaPluginCards lumaLocalAlbumSkin" style={localAlbumStyle(owned.albumSkin)} aria-label="Luma 卡牌图鉴与个人收藏">
    <div className="lumaPluginCardsMode"><nav aria-label="图鉴与持有卡册"><button type="button" aria-pressed={view === 'catalog'} onClick={() => setView('catalog')}>作品图鉴</button>
      <button type="button" aria-pressed={view === 'owned'} onClick={() => setView('owned')}>我的卡册 · {owned.cards.length}</button>
      <button type="button" aria-pressed={view === 'rewards'} onClick={() => setView('rewards')}>伙伴与空间</button></nav><button type="button" onClick={() => onOpenShop()}>选卡包 / 换装帧 ↗</button></div>
    {view === 'rewards' && <CompanionRewards runtime={collection} onFindPack={onOpenShop} />}
    {view === 'catalog' && <p className="lumaPluginCardsNotice" role="note">作品图鉴可自由浏览。喜欢、星级、备注与收藏夹保存在本机；开启卡包获得的卡片会收入“我的卡册”。</p>}
    {view === 'owned' && <header className="lumaAlbumIdentity"><img src={owned.albumSkin.coverUrl} alt={owned.albumSkin.name + '装帧封面'} /><div><span>LUMA · PERSONAL ALBUM</span><h2>把相遇，留在这一页</h2><p>{owned.albumSkin.name} · {owned.cards.length} 张持有卡片 · {cards.length} 个版本</p></div><span className="lumaAlbumIdentityMark" aria-hidden="true">✦</span></header>}
    {view === 'rewards' ? null : view === 'owned' && !cards.length ? <div className="lumaPluginOwnedEmpty"><span>✦</span><h2>你的第一张卡，还在等你揭晓</h2><p>领取新册礼，选择卡包，再把喜欢的相遇收入册中。</p><button type="button" onClick={() => onOpenShop()}>去卡包店</button></div>
      : <LumaCardLibrarySurface key={view} cards={cards} snapshot={snapshot} actions={store} onBack={() => {}}
        {...view === 'owned' ? { ownedCount: owned.cards.length, ownedCounts: owned.ownedCounts, acquiredAtByKey } : {}} />}
  </section>
}
