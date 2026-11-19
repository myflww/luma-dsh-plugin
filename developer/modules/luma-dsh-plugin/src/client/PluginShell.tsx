import { useState } from 'react'
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
import './plugin.css'
import './StudioLayout.css'

export type LumaPage = 'office' | 'messages' | 'cards' | 'shop' | 'settings' | 'native'
const pageIcons = { office:Building2, messages:MessagesSquare, cards:BookOpen, shop:Gift, settings:Settings2 }
export const LUMA_PAGES = Object.freeze([
  { id: 'office', label: '办公室' },
  { id: 'messages', label: '员工工作台' },
  { id: 'cards', label: '卡牌收藏' },
  { id: 'shop', label: '卡包与装帧' },
  { id: 'settings', label: '插件设置' },
] as const)

/** Chat remains the DSH-owned conversation beneath the additive overlay. */
export function PluginShell({ office, cards, collection, messages, preferences, onReturnToDSH, onOpenConversation }: { office: OfficePageRuntime; cards: CardsPageRuntime;
  collection: LocalCollectionRuntime; messages: MessagesRuntime; preferences: PluginPreferencesRuntime; onReturnToDSH?: () => void; onOpenConversation?: () => void }) {
  const [page, setPage] = useState<LumaPage>('office')
  const [cardView, setCardView] = useState<'catalog' | 'owned'>('catalog')
  const [officeNotice, setOfficeNotice] = useState('')
  const [employeeVisit, setEmployeeVisit] = useState<{ mode: 'chat' | 'task' }>()
  const openNative = onReturnToDSH ?? (() => setPage('native'))
  return <div className={`lumaPluginRoot is-${page}${page === 'native' ? ' is-chat' : ''}`} data-luma-plugin="integrated">
    <nav className="lumaPluginNav" aria-label="Luma 页面">
      <span className="lumaPluginBrand">Luma</span>
      <div className="lumaPluginTabs">
        {LUMA_PAGES.map(item => {
          const Icon = pageIcons[item.id]
          return <button key={item.id} data-page={item.id} title={item.label} type="button" aria-current={page === item.id ? 'page' : undefined}
            onClick={() => setPage(item.id)}><Icon aria-hidden="true" size={19}/><span>{item.label}</span></button>
        })}
      </div>
      {onReturnToDSH && <button type="button" className="lumaReturnToDsh" onClick={onReturnToDSH}><ArrowLeft size={17} aria-hidden="true"/>返回 DSH</button>}
    </nav>
    <main className="lumaPluginContent" hidden={page === 'native'}>
      <div hidden={page !== 'office'}>
        {officeNotice && <p className="lumaDshOfficeNotice" role="status">{officeNotice}</p>}
        <OfficePage runtime={office} active={page === 'office'} onOpenChat={(id, intent) => {
          if (messages.selectRole(id, true)) { setOfficeNotice(''); setEmployeeVisit({ mode:intent ?? 'chat' }); setPage('messages') }
          else setOfficeNotice('当前操作处理中，请稍后重试。')
        }} />
      </div>
      <div className="lumaPluginFillPage" hidden={page !== 'messages'}><MessagesPage runtime={messages} employeeVisit={employeeVisit} active={page === 'messages'} onOpenNative={onOpenConversation ?? openNative} /></div>
      {page === 'cards' && <CardsPage runtime={cards} collection={collection} initialView={cardView} onOpenShop={() => setPage('shop')} />}
      {page === 'shop' && <CollectionHub runtime={collection} onOpenOwned={() => { setCardView('owned'); setPage('cards') }} />}
      {page === 'settings' && <PluginSettingsPage runtime={preferences} onOpenNativeSettings={openNative} />}
    </main>
  </div>
}
