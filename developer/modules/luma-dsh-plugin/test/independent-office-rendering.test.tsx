import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IndependentOfficeSceneSurface } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/IndependentOfficeSceneSurface.tsx'

// Synthetic source descriptors exercise the actual canvas consumer, not art
// qualification. Real file hashes/identity remain the asset restoration gate.
const selected = vi.hoisted(() => ({ space: null as any, records: new Map<string, any>(), catalog: null as any }))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/useIndependentOfficeSpace.ts', () => ({
  useIndependentOfficeSpace: () => ({ status: 'ready', space: selected.space }),
}))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts', () => ({
  getOfficeAsset: (id: string) => selected.records.get(id), resolveOfficeAssetUrl: (id: string) => id,
}))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts', () => ({
  getEmployeeCatalogWithSkin: () => selected.catalog,
  getEmployeeSkinWalkProfile: () => ({ coreHeightPx: 20, anchor: { x: .5, y: 1 } }),
}))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/manualActions.ts', () => ({
  resolveOfficeManualAction: (_id: string, action: object | undefined) => action && ({ ...action, asset: 'walk.png', direction: 'down', holdFrame: 3 }),
}))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeActionMenu.tsx', () => ({
  OfficeActionMenu: ({ onAction }: { onAction: (id: string, mode: string) => void }) => <button onClick={() => onAction('front-step', 'loop')}>播放动作</button>,
}))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSkinSelectionNotices.tsx', () => ({ OfficeSkinSelectionNotices: () => null }))

const frames = new Map<number, FrameRequestCallback>()
const sources = new Map<string, { sha: string; width: number; height: number }>()
const bitmaps: Array<{ src: string; width: number; height: number; close: ReturnType<typeof vi.fn> }> = []
const draw = vi.fn(), clip = vi.fn()
let ordinal = 0, now = 0
function source(src: string, width: number, height: number) {
  const sha = (sources.size + 1).toString(16).padStart(64, '0')
  sources.set(src, { sha, width, height }); return sha
}
beforeEach(() => {
  ordinal = 0; now = 0; frames.clear(); sources.clear(); bitmaps.length = 0; draw.mockClear(); clip.mockClear(); selected.records.clear()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), fillRect: vi.fn(), drawImage: draw,
    save: vi.fn(), restore: vi.fn(), transform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), clip,
    getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
  } as unknown as CanvasRenderingContext2D)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++ordinal, callback); return ordinal })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('Blob', class { constructor(readonly parts: ArrayBuffer[]) {} async arrayBuffer() { return this.parts[0]! } })
  vi.stubGlobal('crypto', { subtle: { digest: async (_kind: string, bytes: ArrayBuffer) => bytes } })
  vi.stubGlobal('fetch', vi.fn(async (src: string) => {
    const value = sources.get(src); if (!value) throw Error(`Unexpected source ${src}`)
    return { ok: true, arrayBuffer: async () => Uint8Array.from(value.sha.match(/../gu)!, byte => Number.parseInt(byte, 16)).buffer }
  }))
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
    const sha = Array.from(new Uint8Array(await blob.arrayBuffer()), byte => byte.toString(16).padStart(2, '0')).join('')
    const entry = [...sources.entries()].find(([, value]) => value.sha === sha)!
    const bitmap = { src: entry[0], width: entry[1].width, height: entry[1].height, close: vi.fn() }
    bitmaps.push(bitmap); return bitmap
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function fixture(count = 4) {
  const backgroundSha = source('background.png', 100, 100), actorSha = source('actor.png', 20 * count, 20)
  const walk = { frameWidth: 20, frameHeight: 20, frameCount: 4, fps: 10, anchor: { x: .5, y: 1 }, loop: true }
  selected.records.set('walk.png', { sha256: source('walk.png', 80, 20), dimensions: { width: 80, height: 20 }, frameStrip: walk })
  selected.catalog = { walk: { down: 'walk.png' }, reportHandoff: {} }
  const binding = { employeeId: 'lu-mi', skinId: '', stationId: 'north-private', browserSrc: 'actor.png', sourceSha256: actorSha,
    frameSize: [20, 20], frameCount: count, frameOrder: Array.from({ length: count }, (_, i) => i),
    frameDurationsMs: Array.from({ length: count }, () => 100), restFrame: count - 1, origin: [10, 20], uniformScale: 1, visualReviewed: true }
  selected.space = { layout: { kind: 'office', theme: 'office.fixture', size: [100, 100],
    navigation: { entry: [50, 60] }, stations: [{ id: 'north-private', seat: [20, 40], approach: [20, 40], height: 40,
      dropPolygon: [], foregroundPolygons: [] }], renderBindings: [binding] },
    phases: { noon: { src: 'background.png', sha256: backgroundSha } } }
  const props: any = { officeTheme: 'office.fixture', employees: [{ id: 'lu-mi', name: '陆弥', activity: 'idle', availability: 'available',
    sceneActivity: 'idle', workstationId: 'north-private', canDrag: true }], reports: [], timePolicy: { phase: 'noon', charactersPresent: true } }
  return { binding: binding as any, props, backgroundSha, actorSha }
}
async function mounted(props: any) {
  const view = render(<IndependentOfficeSceneSurface {...props} />)
  await waitFor(() => expect(frames.size).toBe(1)); return view
}
function paint() {
  const entry = frames.entries().next().value; if (!entry) throw Error('No scene paint scheduled')
  frames.delete(entry[0]); now += 50; draw.mockClear(); act(() => entry[1](now))
}
function actorDraws(src = 'actor.png') { return draw.mock.calls.filter(call => call.length === 9 && call[0].src === src) }

function pointAt(canvas: HTMLElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } })
  fireEvent(canvas, event)
}
function tap(canvas: HTMLElement, x: number, y: number) {
  pointAt(canvas, 'pointerdown', x, y); pointAt(canvas, 'pointerup', x, y)
}

it('delivers an equipped paper plane using pointer and keyboard coordinates on the painted actor',async()=>{
  const {props}=fixture(), give=vi.fn(), chat=vi.fn()
  const view=await mounted({...props,paperPlanePick:give,onCharacterClick:chat,employeeDestination:'contact'})
  paint()
  const canvas=view.getByLabelText('主题办公室')
  Object.assign(canvas,{setPointerCapture(){}})
  tap(canvas,15,25)
  expect(give.mock.calls[0]).toEqual(['lu-mi',{x:15,y:25}])
  fireEvent.click(view.getByRole('button',{name:'把纸飞机递给陆弥'}))
  expect(give.mock.calls[1]![1].x).toBeCloseTo(20)
  expect(give.mock.calls[1]![1].y).toBeGreaterThan(20)
  expect(chat).not.toHaveBeenCalled()
})

it('names the occupied desk during drag and reports a failed save without delivering the equipped item',async()=>{
  const {props}=fixture(),give=vi.fn(),bind=vi.fn(async()=>({status:'rejected'}))
  const other={...selected.space.layout.stations[0],id:'south-left',seat:[80,80],approach:[80,80]}
  selected.space.layout.stations.push(other)
  props.employees.push({...props.employees[0],id:'shan',name:'端木嫣',workstationId:'south-left'})
  const view=await mounted({...props,paperPlanePick:give,onBindWorkstation:bind,employeeDestination:'contact'})
  paint()
  const canvas=view.getByLabelText('主题办公室')
  Object.assign(canvas,{setPointerCapture(){}})
  pointAt(canvas,'pointerdown',15,25);pointAt(canvas,'pointermove',80,80)
  const preview=view.container.querySelector('[data-phase="preview"]')!
  expect(preview.textContent).toContain('南排左工位')
  expect(preview.textContent).toContain('与端木嫣交换工位')
  pointAt(canvas,'pointerup',80,80)
  await waitFor(()=>expect(view.container.querySelector('[data-phase="error"]')?.textContent).toContain('陆弥的工位未保存'))
  expect(bind.mock.calls).toEqual([['lu-mi','south-left']])
  expect(give).not.toHaveBeenCalled()
})

it('opens a themed office employee on one tap or accessible button activation and ignores cancelled gestures', async () => {
  const { props } = fixture()
  const open = vi.fn()
  const view = await mounted({ ...props, employeeDestination: 'workbench', onCharacterClick: open })
  paint()
  const canvas = view.getByLabelText('主题办公室')
  const pointer = (type: string) => pointAt(canvas, type, 15, 25)
  pointer('pointerdown'); pointer('pointercancel'); pointer('pointerup')
  expect(open).not.toHaveBeenCalled()
  pointer('pointerdown'); pointer('pointerup')
  expect(open.mock.calls).toEqual([['lu-mi']])
  fireEvent.click(view.getByRole('button', { name: '打开陆弥的工作台', exact: true }), { detail: 0 })
  expect(open.mock.calls).toEqual([['lu-mi'], ['lu-mi']])
})

it('uses a distant release to place a themed employee when all pointer moves were coalesced',async()=>{
  const {props}=fixture(), bind=vi.fn(), open=vi.fn()
  selected.space.layout.stations.push({...selected.space.layout.stations[0],id:'south-left',seat:[80,80],approach:[80,80]})
  const view=await mounted({...props,onBindWorkstation:bind,onCharacterClick:open,employeeDestination:'contact'})
  paint()
  const canvas=view.getByLabelText('主题办公室')
  Object.assign(canvas,{setPointerCapture(){}})
  pointAt(canvas,'pointerdown',15,25)
  pointAt(canvas,'pointerup',80,80)
  expect(bind).toHaveBeenCalledExactlyOnceWith('lu-mi','south-left')
  expect(open).not.toHaveBeenCalled()
})

it.each(['own chair', 'other desk', 'readback blocked'])('targets the visible employee through %s with real scene coordinates', async scenario => {
  const { props } = fixture()
  const station = selected.space.layout.stations[0]
  const covered = [[[12, 22], [28, 22], [28, 38], [12, 38]]]
  if (scenario === 'own chair') station.foregroundPolygons = covered
  if (scenario === 'other desk') selected.space.layout.stations.push({ ...station, id: 'south-left', seat: [20, 42], foregroundPolygons: covered })
  const open = vi.fn(), view = await mounted({ ...props, employeeDestination: 'workbench', onCharacterClick: open })
  paint()
  const canvas = view.getByLabelText('主题办公室') as HTMLCanvasElement
  if (scenario === 'readback blocked') vi.spyOn(canvas.getContext('2d')!, 'getImageData').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
  tap(canvas, 20, 29)
  tap(canvas, 85, 95)
  expect(open.mock.calls).toEqual(scenario === 'other desk' ? [] : [['lu-mi']])
})

it('prefers the actually painted front actor and declines an ambiguous geometric fallback', async () => {
  const { props, binding } = fixture()
  const station = selected.space.layout.stations[0]
  selected.space.layout.stations.push({ ...station, id: 'south-left', seat: [20, 42] })
  selected.space.layout.renderBindings.push({ ...binding, employeeId: 'shan', stationId: 'south-left' })
  props.employees.push({ ...props.employees[0], id: 'shan', name: '端木嫣', workstationId: 'south-left' })
  const open = vi.fn(), view = await mounted({ ...props, employeeDestination: 'workbench', onCharacterClick: open })
  paint()
  const canvas = view.getByLabelText('主题办公室') as HTMLCanvasElement
  tap(canvas, 20, 29)
  expect(open.mock.calls).toEqual([['shan']])
  vi.spyOn(canvas.getContext('2d')!, 'getImageData').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
  tap(canvas, 20, 29)
  expect(open.mock.calls).toEqual([['shan']])
})

it.each([2, 3, 4])('plays all %i complete source cells, freezes at the authored rest, and releases ownership', async count => {
  const { props } = fixture(count)
  props.employees[0].sceneActivity = 'working'
  const view = await mounted(props)
  const cells = new Set<number>()
  for (let i = 0; i < count * 2; i++) { paint(); cells.add(actorDraws()[0]![1]) }
  expect([...cells]).toEqual(Array.from({ length: count }, (_, i) => i * 20))
  view.rerender(<IndependentOfficeSceneSurface {...props} reduceMotion />); paint()
  expect(actorDraws()[0]!.slice(1, 5)).toEqual([(count - 1) * 20, 0, 20, 20]); expect(frames.size).toBe(0)
  view.unmount(); for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1)
})

it('starts a newly working complete pose at its own first cell after idle time', async () => {
  const { props } = fixture()
  const view = await mounted(props); paint()
  for (let i = 0; i < 5; i++) { view.rerender(<IndependentOfficeSceneSurface {...props} employees={props.employees.map((e: any) => ({ ...e }))} />); paint() }
  view.rerender(<IndependentOfficeSceneSurface {...props} employees={[{ ...props.employees[0], sceneActivity: 'working' }]} />); paint()
  expect(actorDraws()[0]![1]).toBe(0)
})

it('repairs only the selected occupied chair before its complete person and uses its own foreground', async () => {
  const { props, binding, backgroundSha, actorSha } = fixture()
  binding.integratedChair = { kind: 'whole-person-chair', employeeId: binding.employeeId, skinId: '', stationId: binding.stationId,
    officeTheme: 'office.fixture', phase: 'noon', actorSourceSha256: actorSha, originalBackgroundSha256: backgroundSha,
    cleanPlate: { browserSrc: '/plate.png', sha256: source('/plate.png', 100, 100), size: [100, 100] },
    chairRemovalPolygons: [[[10, 20], [30, 20], [30, 40], [10, 40]]], foregroundPolygons: [[[10, 35], [30, 35], [30, 40], [10, 40]]] }
  await mounted(props); paint()
  const plate = draw.mock.calls.findIndex(call => call[0].src === '/plate.png'), actor = draw.mock.calls.findIndex(call => call[0].src === 'actor.png')
  expect(plate).toBeGreaterThan(0); expect(actor).toBeGreaterThan(plate)
  expect(draw.mock.calls.at(-1)![0].src).toBe('background.png'); expect(clip).toHaveBeenCalledTimes(2)
})

it('restores the same current-frame hair pixels above only its authored furniture intersection', async () => {
  const { props, binding, actorSha } = fixture()
  selected.space.layout.stations[0].foregroundPolygons = [[[10, 30], [30, 30], [30, 40], [10, 40]]]
  binding.sourceForegroundPolygons = [[[0, 10], [20, 10], [20, 20], [0, 20]]]
  binding.sourceForegroundOccluderPolygons = [[[10, 30], [30, 30], [30, 40], [10, 40]]]
  binding.actorFurnitureOwnership = { actor: 'complete-chair-free-person', sourceHasChair: false }
  binding.sourceForegroundSemantics = { coordinateSpace: 'source-frame-pixels', sourceSHA256: actorSha, kind: 'near-hair' }
  await mounted(props); paint()
  const actors = actorDraws()
  expect(actors).toHaveLength(2); expect(actors[1]).toEqual(actors[0]); expect(clip).toHaveBeenCalledTimes(4)
})

it('reads manual and report cells from the real two-row atlas in a room without a floor graph', async () => {
  const { props } = fixture()
  const record = selected.records.get('walk.png')
  Object.assign(record.frameStrip, { atlasColumns: 2, atlasRows: 2 })
  record.dimensions = { width: 40, height: 40 }; Object.assign(sources.get('walk.png')!, record.dimensions)
  const view = await mounted(props); paint()
  fireEvent.contextMenu(view.getByLabelText('主题办公室'), { clientX: 15, clientY: 25 })
  fireEvent.click(view.getByRole('button', { name: '播放动作' }))
  await waitFor(() => expect(frames.size).toBe(1))
  for (let i = 0; i <= 4; i++) paint()
  expect(actorDraws('walk.png')[0]!.slice(1, 5)).toEqual([0, 20, 20, 20])
  view.unmount()

  // A fresh scene's completion path must use the same explicit atlas geometry.
  selected.catalog.reportHandoff = { asset: 'walk.png', frameCount: 4, mode: 'frame-strip' }
  const complete = { type: 'complete-task', commandId: 'report', taskId: 'task', employeeId: 'lu-mi', workstationId: 'north-private' }
  await mounted({ ...props, commands: [complete], reduceMotion: true }); paint()
  expect(actorDraws('walk.png')[0]!.slice(1, 5)).toEqual([20, 20, 20, 20])
})

it('refuses a chair source qualified for another phase before any actor is painted', async () => {
  const { props, binding, backgroundSha, actorSha } = fixture()
  binding.integratedChair = { kind: 'whole-person-chair', employeeId: binding.employeeId, skinId: '', stationId: binding.stationId,
    officeTheme: 'office.fixture', phase: 'night', actorSourceSha256: actorSha, originalBackgroundSha256: backgroundSha }
  const onSceneEvent = vi.fn()
  const view = render(<IndependentOfficeSceneSurface {...props} onSceneEvent={onSceneEvent} />)
  await waitFor(() => expect(view.getByRole('status').textContent).toContain('尚不可用'))
  expect(frames.size).toBe(0); expect(actorDraws()).toHaveLength(0); expect(onSceneEvent).not.toHaveBeenCalled()
})

function enableFloor(props:any) {
  selected.catalog.walk={down:'walk.png',up:'walk.png',left:'walk.png',right:'walk.png'}
  selected.space.layout.navigation.floorGraph={schemaVersion:1,visualReviewed:true,sourceSize:[100,100],entryNode:'entry',
    nodes:{entry:{point:[50,60],bodyCoreHeightPx:20},seat:{point:[20,40],bodyCoreHeightPx:20}},edges:[['entry','seat']],
    targets:{'north-private':{approachNode:'seat',exitNode:'seat'}}}
  props.timePolicy.autonomy={allowRoaming:true,preferBoundWorkstation:false,roamIntervalMs:[12000,32000]}
}

it.each([[true, false], [true, true], [false, false], [false, true]])('paints the resident and acknowledges a portrait handoff once (floor %s, reduced motion %s)', async (withFloor, reduceMotion) => {
  const {props} = fixture()
  if (withFloor) enableFloor(props)
  selected.catalog.reportHandoff = { mode: 'portrait-transition' }
  const command = { type: 'complete-task', commandId: 'done', taskId: 'one', employeeId: 'lu-mi', workstationId: 'north-private' }
  const onSceneEvent = vi.fn()
  const view = await mounted({...props, commands:[command], onSceneEvent, reduceMotion})
  const emitted = () => onSceneEvent.mock.calls.map(([event]) => event.type)
  for (let n = 0; n < 180 && !emitted().includes('animation-finished'); n++) {
    paint()
    expect(actorDraws('walk.png').length + actorDraws().length).toBeGreaterThan(0)
  }
  expect(emitted()).toEqual(['command-accepted', 'animation-finished'])
  expect((view.getByLabelText('主题办公室') as HTMLCanvasElement).getContext('2d')!.fillRect).toHaveBeenCalled()
  view.unmount()
})

it('draws a separately authored neutral using its own canvas, feet and core height', async()=>{
  const {props}=fixture();enableFloor(props)
  delete props.employees[0].workstationId
  selected.catalog.walkRest={down:{asset:'neutral.png',frameIndex:0,coreHeightPx:40,anchor:{x:.5,y:1}}}
  selected.records.set('neutral.png',{sha256:source('neutral.png',40,60),dimensions:{width:40,height:60},frameStrip:{frameWidth:40,frameHeight:60,frameCount:1,fps:1,anchor:{x:.5,y:1},loop:false}})
  const view=await mounted(props);paint()
  expect(view.queryByText(/站姿.*不匹配/)).toBeNull()
  const calls=actorDraws('neutral.png');expect(calls.length).toBeGreaterThan(0)
  expect(calls[0]!.slice(1,5)).toEqual([0,0,40,60])
  // World core height=20, own source core=40: scale=.5, not inherited from the 20px walk canvas.
  expect(calls[0]!.slice(7,9)).toEqual([20,30])
})

it('lets a seated idle actor play a manual action in a navigable room',async()=>{
  const {props}=fixture();enableFloor(props)
  const view=await mounted(props);paint()
  fireEvent.contextMenu(view.getByLabelText('主题办公室'),{clientX:15,clientY:25})
  fireEvent.click(view.getByRole('button',{name:'播放动作'}))
  await waitFor(()=>expect(frames.size).toBe(1));paint()
  expect(actorDraws('walk.png').length).toBeGreaterThan(0)
  expect(actorDraws('actor.png')).toHaveLength(0)
  expect(JSON.parse(view.getByLabelText('主题办公室').getAttribute('data-office-actors')!)[0].mode).toBe('floor')
})

it('publishes the installed contact scene only after it has painted the current employee roster', async () => {
  const { props } = fixture()
  const view = await mounted({ ...props, employeeDestination:'contact' })
  const canvas = view.getByLabelText('主题办公室') as HTMLCanvasElement
  expect(view.container.querySelector('[data-office-loading]')).toBeTruthy()
  paint()
  expect(JSON.parse(canvas.dataset.officeActors!).map((row: {id:string}) => row.id)).toEqual(['lu-mi'])
  view.rerender(<IndependentOfficeSceneSurface {...props} employees={[]} employeeDestination="contact" />)
  expect(canvas.dataset.officeActors).toBeUndefined()
  await waitFor(() => expect(frames.size).toBeGreaterThan(0))
  paint()
  expect(JSON.parse(canvas.dataset.officeActors!)).toEqual([])
})
