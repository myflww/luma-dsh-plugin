import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft } from 'lucide-react'
import { OfficePage } from './OfficePage.tsx'
import { CardsPage, type CardsPageRuntime } from './CardsPage.tsx'
import type { OfficePageRuntime } from './office-runtime.ts'
import { MessagesPage } from './MessagesPage.tsx'
import { ContactDirectory } from './ContactDirectory.tsx'
import type { MessagesRuntime } from './messages-runtime.ts'
import { CollectionHub } from './CollectionHub.tsx'
import type { LocalCollectionRuntime } from './local-collection-store.ts'
import { PluginSettingsPage } from './PluginSettingsPage.tsx'
import type { PluginPreferencesRuntime } from './plugin-backup-runtime.ts'
import { SceneLaunchers, type HostSidebar } from './SceneLaunchers.tsx'
import { LoveHouseQuickConnect } from './LoveHouseQuickConnect.tsx'
import { CompanionPresence } from './CompanionPresence.tsx'
import { useDesktopPets } from './useDesktopPets.ts'
import { ReleaseNotice, ReleaseSettings, useReleaseCheck } from './ReleaseCenter.tsx'
import './plugin.css'
import './StudioLayout.css'
import './Interface.css'
import './SceneNavigation.css'
import './WorkspaceSurface.css'
import './StudioChrome.css'
import './HostTheme.css'
import './PopupControls.css'

export type LumaPage = 'office' | 'messages' | 'cards' | 'shop' | 'settings' | 'native'
export const LUMA_PAGES = Object.freeze([
  { id: 'office', label: '办公室' },
  { id: 'messages', label: '联系' },
  { id: 'cards', label: '卡牌收藏' },
  { id: 'shop', label: '卡包商店' },
  { id: 'settings', label: '插件设置' },
] as const)

export function PluginShell({ office, cards, collection, messages, preferences, hostSidebar, desktopPetsEnabled = false, onReturnToDSH, onOpenNativeSettings, onOpenConversation }: {
  office: OfficePageRuntime; cards: CardsPageRuntime; collection: LocalCollectionRuntime; messages: MessagesRuntime;
  preferences: PluginPreferencesRuntime; hostSidebar?: HostSidebar; desktopPetsEnabled?: boolean; onReturnToDSH?: () => void; onOpenNativeSettings?: () => void; onOpenConversation?: () => void
}) {
  const releases = useReleaseCheck()
  const [page, setPage] = useState<LumaPage>('office')
  const [cardView, setCardView] = useState<'catalog' | 'owned' | 'rewards'>('owned')
  const [shopPackId, setShopPackId] = useState<string>()
  const { unlockedEmployeeIds, unlockedThemeIds } = useSyncExternalStore(collection.store.subscribe, collection.store.getSnapshot, collection.store.getSnapshot)
  const [officeNotice, setOfficeNotice] = useState('')
  const prefersReducedMotion = useCallback(() => office.getSnapshot().motionPreference === 'reduce', [office])
  const pets = useDesktopPets(desktopPetsEnabled, setOfficeNotice, prefersReducedMotion)
  const [houseOpen, setHouseOpen] = useState(false)
  const [employeeVisit, setEmployeeVisit] = useState<{ mode: 'chat' | 'task'; topic?:string; roleId?:string; panel?:'persona' }>()
  const openNative = onReturnToDSH ?? (() => setPage('native'))
  const openRewards = () => { setCardView('rewards'); setPage('cards') }
  const openShop = (id?: string) => { setShopPackId(id); setPage('shop') }
  const navigate = (id: LumaPage) => {
    if (id === 'shop') return openShop()
    if (id === 'cards') setCardView('owned')
    setPage(id)
  }
  const openContact = useCallback((id: string, intent: 'task' | 'chat' = 'chat', topic?:string, panel?:'persona') => {
    if (!unlockedEmployeeIds.includes(id)) { setCardView('rewards'); setPage('cards'); return }
    if (messages.selectRole(id, true)) {
      setOfficeNotice(''); setEmployeeVisit({ mode: intent,roleId:id,...(topic?{topic}:{}),...(panel?{panel}:{}) }); setPage('messages')
    } else setOfficeNotice('当前操作处理中，请稍后重试。')
  }, [unlockedEmployeeIds, messages])
  const inRoom = page === 'office'
  const shell = useRef<HTMLDivElement>(null)
  const launchers = <SceneLaunchers current={page} hostSidebar={hostSidebar} onPage={navigate} onExit={openNative} onHouse={() => setHouseOpen(true)} />
  useEffect(() => {
    if (inRoom) return
    const active = document.activeElement
    // A destination such as the welcome gift can own a more precise focus target.
    if (active instanceof HTMLElement && shell.current?.querySelector('main')?.contains(active) && active.getClientRects().length) return
    shell.current?.querySelector<HTMLElement>('.lumaSheetHeader button')?.focus({ preventScroll: true })
  }, [inRoom, page])
  return <div ref={shell} className={`lumaPluginRoot lumaWorkspace is-${page}${page === 'native' ? ' is-chat' : ''}`} data-luma-plugin="integrated"
    onKeyDownCapture={event=>{
      // Let Escape dismiss the native picker before an enclosing drawer handles it.
      if (event.key === 'Escape' && globalThis.CSS?.supports?.('selector(select:open)') && event.currentTarget.querySelector('select:open')) {
        event.stopPropagation()
      }
    }}>
    {!inRoom && <header className="lumaSheetHeader">
      {launchers}
      <strong>{LUMA_PAGES.find(item => item.id === page)?.label ?? 'DSH'}</strong>
      <button type="button" className="lumaBackToScene" onClick={() => navigate('office')}><ArrowLeft size={16} aria-hidden="true" />返回场景</button>
    </header>}
    <ContactDirectory messages={messages} openContact={openContact}><main className="lumaPluginContent" hidden={page === 'native'}>
      <div className="lumaScenePage" hidden={!inRoom}>
        {officeNotice && <p className="lumaDshOfficeNotice" role="status">{officeNotice}</p>}
        <OfficePage runtime={office} readEmployeeUsage={collection.readEmployeeUsage} active={inRoom} unlockedEmployeeIds={unlockedEmployeeIds} unlockedThemeIds={unlockedThemeIds}
          desktopPetRoleIds={pets.roleIds} onDesktopPet={pets.open} onRecallDesktopPet={pets.recall}
          sceneMenu={inRoom ? launchers : null} onOpenRewards={openRewards} onOpenBedroomShop={()=>openShop('bedroom-skins')} onOpenChat={openContact}/>
      </div>
      <div className="lumaPluginFillPage" hidden={page !== 'messages'}><MessagesPage runtime={messages} employeeVisit={employeeVisit} active={page === 'messages'} unlockedEmployeeIds={unlockedEmployeeIds} onOpenRewards={openRewards} onOpenNative={onOpenConversation ?? openNative}/></div>
      {page === 'cards' && <CardsPage runtime={cards} collection={collection} initialView={cardView} onOpenShop={openShop}/>}
      {page === 'shop' && <CollectionHub runtime={collection} {...(shopPackId ? { initialPackId: shopPackId } : {})} onOpenOwned={() => navigate('cards')}/>}
      {page === 'settings' && <PluginSettingsPage updates={<ReleaseSettings state={releases}/>} runtime={preferences}
        roster={{ messages, unlocked: unlockedEmployeeIds, openContact, editPersona:id=>openContact(id,'chat',undefined,'persona') }} {...(onOpenNativeSettings ? {onOpenNativeSettings} : {})}/>}
    </main></ContactDirectory>
    <CompanionPresence messages={messages} office={office} sceneVisible={inRoom} onContact={openContact} onLetter={letter=>openContact(letter.role,'chat',letter.topic)}/>
    <ReleaseNotice state={releases}/>
    {houseOpen && <LoveHouseQuickConnect onClose={() => setHouseOpen(false)}/>}
  </div>
}
