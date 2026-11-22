import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficePresentationStore } from '../src/client/OfficePresentationStore.ts'
import { OFFICE_OUTFIT_CHOICES } from '../src/client/office-theme-catalog.ts'
import { decodeOfficePresentationSettings, validateOfficePresentationSettingsWire } from '../src/office-presentation-settings.ts'
import { OfficePage } from '../src/client/OfficePage.tsx'
import type { OfficePageRuntime } from '../src/client/office-runtime.ts'

const scene = vi.hoisted(() => ({ props: {} as Record<string, any> }))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSurface.tsx', () => ({
  OfficeSceneSurface: (props: Record<string, any>) => { scene.props = props; return <div data-testid="actual-scene-port" /> },
}))

function scope(initial: unknown = {}) {
  let raw = initial, revision = 1
  const listeners = new Set<() => void>()
  const source = {
    getSnapshot: () => ({ status: 'ready' as const, writable: true, mode: 'host' as const, value: decodeOfficePresentationSettings(raw), user: raw, revision }),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    replace(value: unknown) { raw = value; revision++; for (const listener of [...listeners]) listener() },
    set: vi.fn(async (field: string, value: unknown) => { const next = { [field]: value }; validateOfficePresentationSettingsWire(next); source.replace(next) }),
    get subscribers() { return listeners.size },
  }
  return source
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('DSH office presentation preferences', () => {
  it('writes no defaults; room and exact own outfits survive a new store over the same Host data', async () => {
    const host = scope(), first = new OfficePresentationStore(host)
    expect(host.set).not.toHaveBeenCalled()
    expect(await first.setTheme('office.grok.v1')).toEqual({ status: 'saved' })
    expect(await first.setOutfit('shan', 'skin.shan.v1')).toEqual({ status: 'saved' })
    expect(await first.setPresence('all')).toEqual({ status: 'saved' })
    const reopened = new OfficePresentationStore(host)
    expect(reopened.getSnapshot().selection).toMatchObject({ officeTheme: 'office.grok.v1', employeeSkins: { shan: 'skin.shan.v1' }, presence: 'all' })
    expect(await reopened.setTheme('office.grok.v1')).toEqual({ status: 'unchanged' })
    expect(host.set).toHaveBeenCalledTimes(3)
    expect(await reopened.setOutfit('shan', null)).toEqual({ status: 'saved' })
    expect(first.getSnapshot().selection.employeeSkins).toEqual({})
    first.dispose(); reopened.dispose()
    expect(host.subscribers).toBe(0)
  })

  it('requires Host readback before changing the room and preserves a competing window choice', async () => {
    const host = scope(), store = new OfficePresentationStore(host)
    host.set.mockImplementation(async () => {})
    expect((await store.setTheme('office.claude.v1')).status).toBe('rejected')
    expect(store.getSnapshot().selection.officeTheme).toBe('office.jingyuniang.v1')
    host.set.mockImplementation(async () => { host.replace({ selection: { schemaVersion: 1, officeTheme: 'office.longmama.v1', employeeSkins: {} } }) })
    expect((await store.setTheme('office.claude.v1')).status).toBe('rejected')
    expect(store.getSnapshot().selection.officeTheme).toBe('office.longmama.v1')
    expect(host.set).toHaveBeenCalledTimes(2)
    store.dispose()
  })

  it('keeps future settings intact and rejects unknown rooms and cross-character clothing', async () => {
    const host = scope(), store = new OfficePresentationStore(host)
    expect((await store.setTheme('office.unknown.v1')).status).toBe('rejected')
    expect((await store.setOutfit('shan', 'skin.lu-mi.v1')).status).toBe('rejected')
    expect((await store.setPresence('running')).status).toBe('rejected')
    expect(host.set).not.toHaveBeenCalled()
    const future = { selection: { schemaVersion: 2, officeTheme: 'office.claude.v1', employeeSkins: {} } }
    host.replace(future)
    expect(store.getSnapshot().status).toBe('unsupported')
    expect((await store.setTheme(null)).status).toBe('rejected')
    expect(host.getSnapshot().user).toBe(future)
    expect(host.set).not.toHaveBeenCalled()
    expect(() => validateOfficePresentationSettingsWire({ selection: { schemaVersion: 1, officeTheme: null, employeeSkins: { grok: 'skin.gemini.v1' } } })).toThrow()
    store.dispose()
  })

  it('admits eight Browser outfits without inventing a second base for the two new actors', async () => {
    expect(OFFICE_OUTFIT_CHOICES).toHaveLength(8)
    expect(OFFICE_OUTFIT_CHOICES.every(choice => choice.available)).toBe(true)
    expect(OFFICE_OUTFIT_CHOICES.filter(choice => choice.defaultSkinId !== undefined).map(choice => choice.employeeId)).toEqual(['gemini', 'grok'])
    const host = scope(), store = new OfficePresentationStore(host)
    for (const choice of OFFICE_OUTFIT_CHOICES) expect((await store.setOutfit(choice.employeeId, choice.skinId)).status).toBe('saved')
    expect(Object.keys(store.getSnapshot().selection.employeeSkins)).toHaveLength(8)
    store.dispose()
  })

  it('keeps a single bedroom decoration in one room and restores both selections from the host', async () => {
    const host=scope(), store=new OfficePresentationStore(host)
    expect((await store.setBedroomTheme('shan','bedroom.jingyuniang.v1')).status).toBe('saved')
    expect(store.getSnapshot().selection.bedroomThemes).toEqual({shan:'bedroom.jingyuniang.v1'})
    expect((await store.setBedroomTheme('shan','office.shan.v1')).status).toBe('rejected')
    const reopened=new OfficePresentationStore(host)
    expect(reopened.getSnapshot().selection.bedroomThemes).toEqual({shan:'bedroom.jingyuniang.v1'})
    expect((await reopened.setBedroomTheme('shan',null)).status).toBe('saved')
    expect(store.getSnapshot().selection.bedroomThemes).toEqual({})
    store.dispose(); reopened.dispose()
  })

  it('starts with the whale, routes locked rewards to collection and uses a single room for each resident', async () => {
    vi.useFakeTimers({toFake:['Date']})
    const date=(hour:number)=>new Date(2026,10,19,hour)
    vi.setSystemTime(date(3))
    const store=new OfficePresentationStore(scope({ selection:{schemaVersion:1,officeTheme:'office.grok.v1',employeeSkins:{},presence:'all'} }))
    const raw = ['jingyuniang','shan'].map((employeeId,i)=>({employeeId,displayName:['鲸鱼娘','端木嫣'][i],sceneActivity:'idle',taskState:'idle',canDrag:true}))
    const runtime = {
      getSnapshot:()=>({presentation:store.getSnapshot(),projection:{employees:raw,officeReportMarkers:[]},commands:[],persistence:'host'}),
      subscribe:store.subscribe,setTheme:(theme:string|null)=>store.setTheme(theme),
      setBedroomTheme:(id:string,theme:string|null)=>store.setBedroomTheme(id,theme),
      setOutfit:(id:string,skin:string|null)=>store.setOutfit(id,skin),
    } as unknown as OfficePageRuntime
    const rewards=vi.fn(), chat=vi.fn()
    const view=render(<OfficePage runtime={runtime} onOpenChat={chat} onOpenRewards={rewards}/>)
    expect(scene.props.officeTheme).toBeUndefined()
    expect(scene.props.employees).toHaveLength(0)
    fireEvent.click(view.getByRole('button',{name:'换肤'}))
    const officeSelector = view.getByRole('region',{name:'办公室主题'})
    expect(officeSelector.querySelectorAll('li button')).toHaveLength(2)
    expect(officeSelector.textContent).not.toMatch(/待解锁|陆弥/)
    expect(officeSelector.querySelectorAll('li img')).toHaveLength(2)
    fireEvent.click(view.getByRole('button',{name:'查看主题解锁进度'}))
    expect(rewards).toHaveBeenCalledOnce()
    fireEvent.click(view.getByRole('button',{name:'伙伴卧室'}))
    expect(view.container.querySelector('[data-bedroom-pose="sleep"]')).toBeTruthy()
    expect((view.getByLabelText('选择房间') as HTMLSelectElement).options).toHaveLength(1)
    fireEvent.click(view.getByRole('button',{name:'换肤'}))
    const bedroomSelector=view.getByRole('region',{name:'卧室主题'})
    expect(bedroomSelector.querySelector('[aria-pressed=true]')?.getAttribute('aria-label')).toBe('鲸鱼娘主题')
    expect(bedroomSelector.textContent).not.toMatch(/待解锁|陆弥/)
    fireEvent.click(view.getByRole('button',{name:'经典卧室'}))
    await waitFor(()=>expect(view.container.querySelector('.lumaBedroomArt > img')?.getAttribute('src')).toContain('bedroom-classic-night'))
    fireEvent.click(view.getByRole('button',{name:'换装'}))
    expect((view.getByLabelText('衣橱员工') as HTMLSelectElement).options).toHaveLength(1)
    vi.setSystemTime(date(12))
    fireEvent(document, new Event('visibilitychange'))
    expect(view.container.querySelector('.lumaBedroomResidentLayer')).toBeNull()
    expect(view.getByText('在办公室 · 午间休息')).toBeTruthy()
    fireEvent.click(view.getByRole('button',{name:'返回办公室'}))
    expect(scene.props.employees.map((e:{id:string})=>e.id)).toEqual(['jingyuniang'])
    vi.setSystemTime(date(22))
    raw[0]!.sceneActivity='working'; raw[0]!.taskState='running'
    fireEvent(document, new Event('visibilitychange'))
    expect(scene.props.employees.map((e:{id:string})=>e.id)).toEqual(['jingyuniang'])
    expect(scene.props.timePolicy.monitors.mode).toBe('active-tasks-only')
    fireEvent.click(view.getByRole('button',{name:'伙伴卧室'}))
    expect(view.container.querySelector('.lumaBedroomResidentLayer')).toBeNull()
    expect(view.getByText('在办公室 · 正在处理任务')).toBeTruthy()
    store.dispose()
  })
  it('opens the same employee workspace from the roster, bedroom and office without creating native sessions', () => {
    const store = new OfficePresentationStore(scope()), openWorkspace = vi.fn(), openNative = vi.fn()
    const runtime = {
      getSnapshot: () => ({ presentation:store.getSnapshot(), projection:{employees:[{employeeId:'shan', displayName:'端木嫣', sceneActivity:'idle',taskState:'idle',canDrag:true}],officeReportMarkers:[]},commands:[],persistence:'host' }),
      subscribe:store.subscribe, openChat:openNative,
    } as unknown as OfficePageRuntime
    const view = render(<OfficePage runtime={runtime} onOpenChat={openWorkspace} unlockedEmployeeIds={['shan','jingyuniang']}/>)
    scene.props.onCharacterClick('shan')
    fireEvent.click(view.getByRole('button',{name:'员工列表'}))
    fireEvent.click(view.getByRole('button',{name:'联系端木嫣'}))
    fireEvent.click(view.getByRole('button',{name:'进入端木嫣的卧室'}))
    fireEvent.click(view.getByRole('button',{name:'联系端木嫣'}))
    expect(openWorkspace.mock.calls).toEqual([['shan'],['shan'],['shan']])
    fireEvent.change(view.getByRole('combobox',{name:'选择房间'}), {target:{value:'jingyuniang'}})
    const shortcut = view.getByRole('button',{name:'给鲸鱼娘派任务'})
    expect(shortcut).toBeTruthy()
    fireEvent.click(shortcut)
    expect(openWorkspace).toHaveBeenLastCalledWith('jingyuniang', 'task')
    expect(view.getByRole('button',{name:'联系鲸鱼娘'})).toBeTruthy()
    expect(openNative).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button',{name:'返回办公室'}))
    expect(view.getByTestId('actual-scene-port')).toBeTruthy()
    store.dispose()
  })
  it('keeps the scene mounted when opening tools and restores keyboard focus when they close', () => {
    const store = new OfficePresentationStore(scope())
    const runtime = {
      getSnapshot:()=>({ presentation:store.getSnapshot(), projection:{employees:[],officeReportMarkers:[]}, commands:[], persistence:'host' }),
      subscribe:store.subscribe,
    } as unknown as OfficePageRuntime
    const view = render(<OfficePage runtime={runtime} onOpenChat={()=>{}} sceneMenu={<button>场景菜单</button>}/>)
    const canvas = view.getByTestId('actual-scene-port')
    const rosterButton = view.getByRole('button',{name:'员工列表'})
    fireEvent.click(rosterButton)
    expect(view.getByRole('dialog',{name:'员工列表'})).toBeTruthy()
    fireEvent.keyDown(document.activeElement!,{key:'Escape'})
    expect(view.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(rosterButton)
    fireEvent.click(view.getByRole('button',{name:'查看全景'}))
    expect(view.getByRole('region',{name:'场景全景'}).contains(canvas)).toBe(true)
    fireEvent.click(view.getByRole('button',{name:'隐藏场景按钮'}))
    expect(view.queryByRole('button',{name:'场景菜单'})).toBeNull()
    expect(view.getByRole('button',{name:'显示场景按钮'})).toBeTruthy()
    fireEvent.keyDown(document,{key:'Escape'})
    expect(view.getByRole('button',{name:'场景菜单'})).toBeTruthy()
    expect(view.getByTestId('actual-scene-port')).toBe(canvas)
    store.dispose()
  })
})
