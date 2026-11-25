import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficePresentationStore } from '../src/client/OfficePresentationStore.ts'
import { OFFICE_OUTFIT_CHOICES } from '../src/client/office-theme-catalog.ts'
import { SHOP_BEDROOMS } from '../src/shared/shop-bedrooms.ts'
import { SHOP_BEDROOM_ART } from '../src/client/bedroom-art.generated.ts'
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
  it('renames rooms independently, keeps old preferences and validates custom names on the host', async () => {
    const theme = 'office.jingyuniang.v1', host = scope({selection: {
      schemaVersion: 1, officeTheme: theme, employeeSkins: {}, presence: 'schedule',
    }})
    const access = () => ({unlockedEmployeeIds:['jingyuniang'], unlockedThemeIds:[theme]})
    const store = new OfficePresentationStore(host, access)
    expect((await store.setOfficeName('office.claude.v1', '别人的房间')).status).toBe('rejected')
    await Promise.all([store.setOfficeName(null, '  启航  '), store.setOfficeName(theme, '潮汐档案室')])
    store.dispose()
    const restored = new OfficePresentationStore(host, access)
    expect(restored.getSnapshot().selection).toMatchObject({
      officeTheme:theme, presence:'schedule', officeNames:{classic:'启航',[theme]:'潮汐档案室'},
    })
    await restored.setOfficeName(theme, '   ')
    expect(restored.getSnapshot().selection.officeNames).toEqual({ classic: '启航' })
    await restored.setOfficeName(null, '')
    expect(restored.getSnapshot().selection.officeNames).toBeUndefined()
    for (const invalid of [JSON.parse('{"__proto__":"标题"}'), {classic:42}, {classic:'换\n行'}]) {
      expect(() => validateOfficePresentationSettingsWire({selection: {
        ...restored.getSnapshot().selection, officeNames: invalid,
      }})).toThrow()
    }
    restored.dispose()
  })
  it('edits the scene heading in place, supports IME and cancel, and restores the default on clearing', async () => {
    const host = scope(), store = new OfficePresentationStore(host)
    const runtime = {
      getSnapshot:()=>({presentation:store.getSnapshot(),projection:{employees:[],officeReportMarkers:[]},commands:[],persistence:'host'}),
      subscribe:store.subscribe, setOfficeName:(theme:string|null, value:string)=>store.setOfficeName(theme,value),
    } as unknown as OfficePageRuntime
    const view=render(<OfficePage runtime={runtime} onOpenChat={()=>{}}/>)
    const edit=(value:string)=>fireEvent.click(view.getByRole('button',{name:'编辑办公室名称，'+value}))
    const input=()=>view.getByRole('textbox',{name:'办公室名称'}) as HTMLInputElement
    edit('经典办公室')
    expect(input()).toBe(document.activeElement)
    fireEvent.change(input(), {target:{value:'潮汐研究室'}})
    fireEvent.keyDown(input(), {key:'Enter',isComposing:true})
    expect(host.set).not.toHaveBeenCalled()
    fireEvent.keyDown(input(), {key:'Enter'})
    expect(await view.findByRole('heading',{name:'潮汐研究室'})).toBeTruthy()
    edit('潮汐研究室')
    fireEvent.change(input(), {target:{value:'草稿'}})
    fireEvent.keyDown(input(), {key:'Escape'})
    expect(view.getByRole('heading',{name:'潮汐研究室'})).toBeTruthy()
    edit('潮汐研究室')
    fireEvent.change(input(), {target:{value:''}})
    fireEvent.click(view.getByRole('button',{name:'保存办公室名称'}))
    expect(await view.findByRole('heading',{name:'经典办公室'})).toBeTruthy()
    view.unmount(); store.dispose()
  })
  it('shares purchased universal themes across resident rooms, retains exclusive-card movement and reopens both assignments',async()=>{
    const host=scope(),owned:string[]=['bedroom.duanmu-yan.v1']
    const access=()=>({unlockedEmployeeIds:['shan','lu-mi'],unlockedThemeIds:owned})
    const store=new OfficePresentationStore(host,access)
    const first=SHOP_BEDROOMS[0].id,second=SHOP_BEDROOMS[1].id
    expect((await store.setBedroomTheme('shan',first)).status).toBe('rejected')
    expect(host.set).not.toHaveBeenCalled()
    owned.push(first,second)
    for(const id of ['shan','lu-mi']) expect((await store.setBedroomTheme(id,first)).status).toBe('saved')
    store.dispose()
    const reopened=new OfficePresentationStore(host,access)
    expect(reopened.getSnapshot().selection.bedroomThemes).toEqual({shan:first,'lu-mi':first})
    expect((await reopened.setBedroomTheme('shan',second)).status).toBe('saved')
    expect(reopened.getSnapshot().selection.bedroomThemes).toEqual({shan:second,'lu-mi':first})
    expect((await reopened.setBedroomTheme('shan','bedroom.duanmu-yan.v1')).status).toBe('saved')
    expect((await reopened.setBedroomTheme('lu-mi','bedroom.duanmu-yan.v1')).status).toBe('saved')
    expect(reopened.getSnapshot().selection.bedroomThemes).toEqual({'lu-mi':'bedroom.duanmu-yan.v1'})
    expect((await reopened.setBedroomTheme('grok',first)).status).toBe('rejected')
    reopened.dispose()
  })
  it('previews a locked room from the bedroom, then equips and renders an owned room for two different residents',async()=>{
    const [owned,locked]=SHOP_BEDROOMS,host=scope(),openShop=vi.fn()
    const ids=['jingyuniang','shan'],themes=[owned.id]
    const store=new OfficePresentationStore(host,()=>({unlockedEmployeeIds:ids,unlockedThemeIds:themes}))
    const employees=ids.map((employeeId,i)=>({employeeId,displayName:['鲸鱼娘','端木嫣'][i],sceneActivity:'idle',taskState:'idle',canDrag:true}))
    const runtime={getSnapshot:()=>({presentation:store.getSnapshot(),projection:{employees,officeReportMarkers:[]},commands:[],persistence:'host'}),
      subscribe:store.subscribe,setBedroomTheme:(id:string,theme:string|null)=>store.setBedroomTheme(id,theme)} as unknown as OfficePageRuntime
    const view=render(<OfficePage runtime={runtime} unlockedEmployeeIds={ids} unlockedThemeIds={themes} onOpenChat={vi.fn()} onOpenBedroomShop={openShop}/>)
    fireEvent.click(view.getByRole('button',{name:'伙伴卧室'}));fireEvent.click(view.getByRole('button',{name:'换肤'}))
    fireEvent.click(view.getByRole('button',{name:'预览'+locked.name}))
    expect(view.getByRole('dialog',{name:locked.name+'预览'}).querySelector('img')?.getAttribute('src')).toBe(SHOP_BEDROOM_ART[locked.id].day)
    fireEvent.click(view.getByRole('button',{name:'关闭预览'}));expect(host.set).not.toHaveBeenCalled()
    expect(view.queryByRole('button',{name:locked.name,exact:true})).toBeNull()
    fireEvent.click(view.getByRole('button',{name:'前往商店'}));expect(openShop).toHaveBeenCalledOnce()
    const equip=()=>fireEvent.click(view.getByRole('button',{name:owned.name,exact:true}))
    equip()
    await waitFor(()=>expect([SHOP_BEDROOM_ART[owned.id].day,SHOP_BEDROOM_ART[owned.id].night]).toContain(view.container.querySelector('.lumaBedroomArt > img')?.getAttribute('src')))
    fireEvent.change(view.getByLabelText('选择房间'),{target:{value:'shan'}})
    fireEvent.click(view.getByRole('button',{name:'换肤'}));equip()
    await waitFor(()=>expect(store.getSnapshot().selection.bedroomThemes).toEqual({jingyuniang:owned.id,shan:owned.id}))
    store.dispose()
  })
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
    expect(store.getSnapshot().selection.officeTheme).toBeNull()
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
    const legacy = scope({selection:{schemaVersion:1,officeTheme:'office.jingyuniang.v1',bedroomThemes:{jingyuniang:'bedroom.jingyuniang.v1'},employeeSkins:{},presence:'all'}})
    const store=new OfficePresentationStore(legacy)
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
    expect(officeSelector.querySelectorAll('li button')).toHaveLength(1)
    expect(officeSelector.textContent).not.toMatch(/待解锁|陆弥/)
    expect(officeSelector.querySelectorAll('li img')).toHaveLength(1)
    fireEvent.click(view.getByRole('button',{name:'查看主题解锁进度'}))
    expect(rewards).toHaveBeenCalledOnce()
    fireEvent.click(view.getByRole('button',{name:'伙伴卧室'}))
    expect(view.container.querySelector('[data-bedroom-pose="sleep"]')).toBeTruthy()
    expect((view.getByLabelText('选择房间') as HTMLSelectElement).options).toHaveLength(1)
    fireEvent.click(view.getByRole('button',{name:'换肤'}))
    const bedroomSelector=view.getByRole('region',{name:'卧室主题'})
    expect(bedroomSelector.querySelector('[aria-pressed=true]')?.getAttribute('aria-label')).toBe('经典卧室')
    expect(bedroomSelector.querySelectorAll('li button')).toHaveLength(1)
    expect(bedroomSelector.textContent).not.toMatch(/待解锁|陆弥/)
    await waitFor(()=>expect(view.container.querySelector('.lumaBedroomArt > img')?.getAttribute('src')).toContain('bedroom-classic-night'))
    expect(legacy.set).not.toHaveBeenCalled()
    view.rerender(<OfficePage runtime={runtime} onOpenChat={chat} onOpenRewards={rewards} unlockedThemeIds={['office.jingyuniang.v1','bedroom.jingyuniang.v1']}/>)
    expect(bedroomSelector.querySelector('[aria-pressed=true]')?.getAttribute('aria-label')).toBe('鲸鱼娘主题')
    expect(view.queryByRole('button',{name:'换装',exact:true})).toBeNull()
    fireEvent.click(view.getByRole('button',{name:'员工列表'}))
    fireEvent.click(view.getByRole('button',{name:'鲸鱼娘换装'}))
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
  it('reads a single report for the open roster and displays each employee’s own next-coin progress', async () => {
    const store = new OfficePresentationStore(scope())
    const employees = [
      { employeeId: 'jingyuniang', displayName: '鲸鱼娘' }, { employeeId: 'shan', displayName: '端木嫣' },
    ].map(employee => ({ ...employee, sceneActivity: 'idle', taskState: 'idle', canDrag: true }))
    const runtime = {
      getSnapshot: () => ({ presentation: store.getSnapshot(), projection: { employees, officeReportMarkers: [] }, commands: [], persistence: 'host' }),
      subscribe: store.subscribe,
    } as unknown as OfficePageRuntime
    const read = vi.fn(async (_signal: AbortSignal) => ({ threshold: 1_000_000, nativeHistoryComplete: true, collectionRevision: 1, roles: {
      jingyuniang: { totalTokens: 10_198, remainderTokens: 10_198, earnedCoins: 0 },
      shan: { totalTokens: 1_000_000, remainderTokens: 0, earnedCoins: 1 },
    }}))
    const view = render(<OfficePage runtime={runtime} readEmployeeUsage={read} onOpenChat={() => {}} unlockedEmployeeIds={['jingyuniang','shan']}/>)
    const toggle = view.getByRole('button', {name: '员工列表'})
    expect(read).not.toHaveBeenCalled()
    fireEvent.click(toggle)
    const whale = await view.findByRole('progressbar', {name: '鲸鱼娘的下一枚星币'}) as HTMLProgressElement
    expect(whale.value).toBe(10_198)
    expect(whale.getAttribute('aria-valuetext')).toContain('989,802 token')
    const shan = view.getByRole('progressbar', {name: '端木嫣的下一枚星币'}) as HTMLProgressElement
    expect(shan.value).toBe(0)
    expect(shan.getAttribute('aria-valuetext')).toContain('已获得 1 星币')
    const details=view.getByRole('button',{name:'查看端木嫣的星币进度'})
    fireEvent.click(details)
    expect(details.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(details.getAttribute('aria-controls')!)?.hidden).toBe(false)
    expect(view.getByRole('dialog',{name:'员工列表'})).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(1)
    const signal = read.mock.calls[0]![0]
    fireEvent.click(toggle)
    expect(signal.aborted).toBe(true)
    fireEvent(document, new Event('visibilitychange'))
    expect(read).toHaveBeenCalledTimes(1)
    read.mockResolvedValueOnce({threshold: 1_000_000, nativeHistoryComplete: false, collectionRevision: 2, roles: {
      jingyuniang: {totalTokens: 1_000_001, remainderTokens: 1, earnedCoins: 1},
      shan: {totalTokens: 1_999_999, remainderTokens: 999_999, earnedCoins: 1},
    }})
    fireEvent.click(toggle)
    await view.findByText('仅显示已同步用量，部分历史会话待核对。')
    expect(view.getByText('<0.1%')).toBeTruthy()
    expect(view.getByText('99.9%')).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
    const failed = vi.fn(async () => { throw Error('暂时无法读取员工用量，请重试。') })
    view.rerender(<OfficePage runtime={runtime} readEmployeeUsage={failed} onOpenChat={() => {}} unlockedEmployeeIds={['jingyuniang','shan']}/>)
    await view.findByText('暂时无法读取员工用量，请重试。')
    expect(view.queryByRole('progressbar')).toBeNull()
    expect(view.getAllByText('用量待同步')).toHaveLength(2)
    store.dispose()
  })

  it('visits a resident directly from the roster and opens the same employee workspace from the bedroom and office', () => {
    const store = new OfficePresentationStore(scope()), openWorkspace = vi.fn(), openNative = vi.fn()
    const runtime = {
      getSnapshot: () => ({ presentation:store.getSnapshot(), projection:{employees:[{employeeId:'shan', displayName:'端木嫣', sceneActivity:'idle',taskState:'idle',canDrag:true}],officeReportMarkers:[]},commands:[],persistence:'host' }),
      subscribe:store.subscribe, openChat:openNative,
    } as unknown as OfficePageRuntime
    const view = render(<OfficePage runtime={runtime} onOpenChat={openWorkspace} unlockedEmployeeIds={['shan','jingyuniang']}/>)
    scene.props.onCharacterClick('shan')
    fireEvent.click(view.getByRole('button',{name:'员工列表'}))
    expect(view.queryByRole('button',{name:'联系端木嫣'})).toBeNull()
    expect(view.queryByRole('combobox',{name:'端木嫣的工位'})).toBeNull()
    fireEvent.click(view.getByRole('button',{name:'进入端木嫣的卧室'}))
    expect(view.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(view.getByRole('button',{name:'伙伴卧室'}))
    expect(view.container.querySelector('.lumaBedroomArt > img')?.getAttribute('src')).toContain('bedroom-classic')
    fireEvent.click(view.getByRole('button',{name:'联系端木嫣'}))
    expect(openWorkspace.mock.calls).toEqual([['shan'],['shan']])
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
  it('keeps dressing, pet controls and their keyboard focus separate from room navigation',()=>{
    const store=new OfficePresentationStore(scope())
    const employees=[{employeeId:'jingyuniang',displayName:'鲸鱼娘'},{employeeId:'shan',displayName:'端木嫣'}].map(row=>({...row,sceneActivity:'idle',taskState:'idle',canDrag:true}))
    const runtime={getSnapshot:()=>({presentation:store.getSnapshot(),projection:{employees,officeReportMarkers:[]},commands:[],persistence:'host'}),subscribe:store.subscribe} as unknown as OfficePageRuntime
    const pet=vi.fn(),recall=vi.fn(),chat=vi.fn()
    const view=render(<OfficePage runtime={runtime} onOpenChat={chat} onDesktopPet={pet} onRecallDesktopPet={recall} desktopPetRoleIds={['shan']} unlockedEmployeeIds={['shan','jingyuniang']}/>)
    const roster=view.getByRole('button',{name:'员工列表'})
    expect(view.getByRole('button',{name:'换肤'})).toBeTruthy()
    expect(view.queryByRole('button',{name:'换装',exact:true})).toBeNull()
    fireEvent.click(roster)
    expect(view.container.querySelector('.lumaCrewRow button button')).toBeNull()
    fireEvent.click(view.getByRole('button',{name:'让鲸鱼娘到桌面陪伴'}))
    fireEvent.click(view.getByRole('button',{name:'让端木嫣回到场景'}))
    expect(pet.mock.calls).toEqual([['jingyuniang']]);expect(recall.mock.calls).toEqual([['shan']])
    fireEvent.click(view.getByRole('button',{name:'端木嫣换装'}))
    expect(view.getByRole('dialog',{name:'员工列表'})).toBeTruthy()
    expect((view.getByLabelText('衣橱员工') as HTMLSelectElement).value).toBe('shan')
    expect(document.activeElement).toBe(view.getByRole('button',{name:'返回员工列表'}))
    expect(view.container.querySelector('.lumaFittingRoom figure > svg > svg[overflow="hidden"]')).toBeTruthy()
    fireEvent.change(view.getByLabelText('衣橱员工'),{target:{value:'jingyuniang'}})
    fireEvent.keyDown(window,{key:'Escape'})
    expect(document.activeElement).toBe(view.getByRole('button',{name:'端木嫣换装'}))
    fireEvent.keyDown(window,{key:'Escape'})
    expect(document.activeElement).toBe(roster)
    expect(view.getByTestId('actual-scene-port')).toBeTruthy()
    expect(chat).not.toHaveBeenCalled()
    store.dispose()
  })
})
