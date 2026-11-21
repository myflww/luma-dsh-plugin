import { useState, useSyncExternalStore } from 'react'
import { Building2, MessagesSquare, BookOpen, Gift, Settings2, ArrowLeft } from 'lucide-react'
import { OfficePage } from './OfficePage.tsx'
import { CardsPage, type CardsPageRuntime } from './CardsPage.tsx'
import type { OfficePageRuntime } from './office-runtime.ts'
import { MessagesPage } from './MessagesPage.tsx'
import type { MessagesRuntime } from './messages-runtime.ts'
import { CollectionHub } from './CollectionHub.tsx'
import type { LocalCollectionRuntime } from './local-collection-store.ts'
import { PluginSettingsPage } from './PluginSettingsPage.tsx'
import type { PluginPreferencesRuntime } from './plugin-backup-runtime.ts'
import { SceneLaunchers, type HostSidebar } from './SceneLaunchers.tsx'
import { LoveHouseQuickConnect } from './LoveHouseQuickConnect.tsx'
import './plugin.css'
import './StudioLayout.css'
import './Interface.css'
import './SceneNavigation.css'

export type LumaPage = 'office' | 'messages' | 'cards' | 'shop' | 'settings' | 'native'
const pageIcons = { office:Building2, messages:MessagesSquare, cards:BookOpen, shop:Gift, settings:Settings2 }
export const LUMA_PAGES = Object.freeze([
  { id: 'office', label: '办公室' },
  { id: 'messages', label: '联系' },
  { id: 'cards', label: '卡牌收藏' },
  { id: 'shop', label: '卡包与装帧' },
  { id: 'settings', label: '插件设置' },
] as const)

/** Chat remains the DSH-owned conversation beneath the additive overlay. */
export function PluginShell({ office, cards, collection, messages, preferences, hostSidebar, onReturnToDSH, onOpenConversation }: { office: OfficePageRuntime; cards: CardsPageRuntime;
  collection: LocalCollectionRuntime; messages: MessagesRuntime; preferences: PluginPreferencesRuntime; hostSidebar?: HostSidebar; onReturnToDSH?: () => void; onOpenConversation?: () => void }) {
  const [page, setPage] = useState<LumaPage>('office')
  const [cardView, setCardView] = useState<'catalog' | 'owned' | 'rewards'>('catalog')
  const [shopPackId, setShopPackId] = useState<string>()
  const { unlockedEmployeeIds, unlockedThemeIds } = useSyncExternalStore(
    collection.store.subscribe, collection.store.getSnapshot, collection.store.getSnapshot,
  )
  const openRewards = () => { setCardView('rewards'); setPage('cards') }
  const openShop = (packId?: string) => { setShopPackId(packId); setPage('shop') }
  const [officeNotice, setOfficeNotice] = useState('')
  const [houseOpen, setHouseOpen] = useState(false)
  const [employeeVisit, setEmployeeVisit] = useState<{ mode: 'chat' | 'task' }>()
  const openNative = onReturnToDSH ?? (() => setPage('native'))
  const navigate = (id: LumaPage) => id === 'shop' ? openShop() : setPage(id)
  return <div className={`lumaPluginRoot is-${page}${page === 'native' ? ' is-chat' : ''}`} data-luma-plugin="integrated">
    {page !== 'office' && <nav className="lumaPluginNav" aria-label="Luma 页面">
      <span className="lumaPluginBrand">Luma</span>
      <div className="lumaPluginTabs">
        {LUMA_PAGES.map(item => {
          const Icon = pageIcons[item.id]
          return <button key={item.id} data-page={item.id} title={item.label} type="button" aria-current={page === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}><Icon aria-hidden="true" size={20} strokeWidth={1.75}/><span>{item.label}</span></button>
        })}
      </div>
      {onReturnToDSH && <button type="button" className="lumaReturnToDsh" onClick={onReturnToDSH}><ArrowLeft size={17} aria-hidden="true"/>返回 DSH</button>}
    </nav>}
    <main className="lumaPluginContent" hidden={page === 'native'}>
      <div className="lumaScenePage" hidden={page !== 'office'}>
        {officeNotice && <p className="lumaDshOfficeNotice" role="status">{officeNotice}</p>}
        <OfficePage runtime={office} active={page === 'office'} unlockedEmployeeIds={unlockedEmployeeIds} unlockedThemeIds={unlockedThemeIds}
          sceneMenu={<SceneLaunchers hostSidebar={hostSidebar} onPage={navigate} onExit={openNative} onHouse={() => setHouseOpen(true)} />}
          onOpenRewards={openRewards} onOpenChat={(id, intent) => {
          if (!unlockedEmployeeIds.includes(id)) { openRewards(); return }
          if (messages.selectRole(id, true)) { setOfficeNotice(''); setEmployeeVisit({ mode:intent ?? 'chat' }); setPage('messages') }
          else setOfficeNotice('当前操作处理中，请稍后重试。')
        }} />
      </div>
      <div className="lumaPluginFillPage" hidden={page !== 'messages'}><MessagesPage runtime={messages} employeeVisit={employeeVisit} active={page === 'messages'} unlockedEmployeeIds={unlockedEmployeeIds} onOpenRewards={openRewards} onOpenNative={onOpenConversation ?? openNative} /></div>
      {page === 'cards' && <CardsPage runtime={cards} collection={collection} initialView={cardView} onOpenShop={openShop} />}
      {page === 'shop' && <CollectionHub runtime={collection} {...(shopPackId ? { initialPackId: shopPackId } : {})} onOpenOwned={() => { setCardView('owned'); setPage('cards') }} />}
      {page === 'settings' && <PluginSettingsPage runtime={preferences} onOpenNativeSettings={openNative} />}
    </main>
    {houseOpen && <LoveHouseQuickConnect onClose={() => setHouseOpen(false)}/>}
  </div>
}
