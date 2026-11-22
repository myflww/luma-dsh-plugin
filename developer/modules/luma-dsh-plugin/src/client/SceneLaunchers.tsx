import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, BookOpen, Gift, House, LayoutGrid, MessagesSquare, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react'

export interface HostSidebar {
  getSnapshot(): boolean
  subscribe(listener: () => void): () => void
  toggle(): void
}

type Destination = 'messages' | 'cards' | 'shop' | 'settings'
const destinations = [
  { page: 'messages', label: '联系', Icon: MessagesSquare },
  { page: 'cards', label: '卡牌收藏', Icon: BookOpen },
  { page: 'shop', label: '卡包商店', Icon: Gift },
  { page: 'settings', label: '插件设置', Icon: Settings2 },
] as const

function SidebarSwitch({ sidebar }: { sidebar: HostSidebar }) {
  const collapsed = useSyncExternalStore(sidebar.subscribe, sidebar.getSnapshot, sidebar.getSnapshot)
  const title = collapsed ? '展开 DSH 侧栏' : '收起 DSH 侧栏'
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose
  return <button type="button" className="lumaHostSidebarSwitch" aria-label={title} title={title}
    onClick={() => sidebar.toggle()}><Icon size={17} aria-hidden="true" /></button>
}

export function SceneLaunchers({ hostSidebar, onPage, onHouse, onExit, current }: {
  current?: string
  hostSidebar?: HostSidebar | undefined
  onPage(page: Destination): void
  onHouse(): void
  onExit(): void
}) {
  const [open, setOpen] = useState(false)
  const controls = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => {
      if (event.target instanceof Node && !controls.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
    }
  }, [open])
  return <div ref={controls} className="lumaSceneLaunchers" onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
  }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)}><LayoutGrid size={17} aria-hidden="true" /><span>菜单</span></button>
    {open && <nav id={menuId} className="lumaSceneNavigation" aria-label="Luma 页面">
      {destinations.map(({ page, label, Icon }) => <button key={page} aria-current={current === page ? 'page' : undefined} type="button" onClick={() => {
        setOpen(false)
        onPage(page)
      }}><Icon size={17} aria-hidden="true" />{label}</button>)}
      <button type="button" onClick={() => { setOpen(false); onExit() }}><ArrowLeft size={17} aria-hidden="true" />返回 DSH</button>
    </nav>}
    <button type="button" aria-haspopup="dialog" onClick={() => { setOpen(false); onHouse() }}>
      <House size={17} aria-hidden="true" /><span>爱之屋</span>
    </button>
    {hostSidebar && <SidebarSwitch sidebar={hostSidebar}/>}
  </div>
}
