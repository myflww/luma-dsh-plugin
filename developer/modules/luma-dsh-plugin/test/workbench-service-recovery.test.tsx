import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { MessagesPage } from '../src/client/MessagesPage.tsx'
import { MESSAGE_CHARACTERS, type MessagesRuntime, type MessagesSnapshot } from '../src/client/messages-runtime.ts'
import { DEFAULT_MESSAGE_PREFERENCES } from '../src/messages-settings.ts'

beforeAll(() => { HTMLElement.prototype.scrollTo = () => {} })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function openDesk(owned?: readonly string[]) {
  const role = MESSAGE_CHARACTERS[0]!
  let snapshot: MessagesSnapshot = { preferences: DEFAULT_MESSAGE_PREFERENCES, roleId: role.id, profile: role.profile,
    topics: [], messages: [], writable: true, pending: false, running: false, attention: false, hasMore: false, loading: false }
  const listeners = new Set<() => void>()
  const send = vi.fn(), newTopic = vi.fn()
  const runtime = { getSnapshot: () => snapshot, send, newTopic,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
    setDraft(text: string) {
      snapshot = { ...snapshot, preferences: { ...snapshot.preferences, drafts: { [role.id]: text } } }
      for (const listener of listeners) listener()
    },
  } as unknown as MessagesRuntime
  const view = render(<MessagesPage runtime={runtime} unlockedEmployeeIds={owned} onOpenNative={() => {}} />)
  return { send, newTopic, visit(mode: 'chat' | 'task') {
    view.rerender(<MessagesPage runtime={runtime} employeeVisit={{ mode }} onOpenNative={() => {}} />)
  }, reopen() {
    view.rerender(<MessagesPage runtime={runtime} active={false} onOpenNative={() => {}} />)
    view.rerender(<MessagesPage runtime={runtime} active onOpenNative={() => {}} />)
  } }
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name, exact: true })
const draft = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: '发送给角色的消息' })
const stateResponse = (model: string) => Response.json({ ok: true, value: {
  roles: { shan: { baseUrl: '', model, hasKey: false } }, jobs: [], memories: {}, loveHouse: { available: false, connected: false },
} })
const outage = () => Response.json({ ok: false, error: '员工服务连接中断' }, { status: 503 })

it('assigns a private workspace window to a real single task, keeps it on retry and clears it after acknowledgement',async()=>{
  const id='a'.repeat(64), sent:any[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    const route=url.split('/').at(-1)!, body=JSON.parse(String(init.body))
    if(route==='desktoptargets')return Response.json({ok:true,value:{targets:[{id,title:'稿件',label:'编辑器 · 稿件',app:'编辑器',browser:false}]}})
    if(route==='desktoppreview')return Response.json({ok:true,value:{targetId:id,app:'编辑器',title:'稿件',capturedAt:1,image:{dataUrl:'data:image/png;base64,AAAA',width:120,height:80}}})
    if(route==='run'){sent.push(body);if(sent.length===1)throw Error('回复丢失');return Response.json({ok:true,value:{}})}
    return stateResponse('local-writer')
  }))
  openDesk(['shan'])
  await screen.findByRole('button',{name:'local-writer',exact:true})
  fireEvent.click(button('打开角色工作区'))
  await screen.findByRole('option',{name:'编辑器 · 稿件'})
  fireEvent.change(screen.getByLabelText('本机应用窗口'),{target:{value:id}})
  await screen.findByAltText('编辑器 · 稿件的实时窗口预览')
  fireEvent.click(button('用于本次派工'))
  fireEvent.change(draft(),{target:{value:'整理这份稿件'}})
  fireEvent.click(button('分配任务'))
  await screen.findByText('回复丢失')
  expect(sent[0]).toMatchObject({roleIds:['shan'],mode:'task',desktopTargets:{shan:id}})
  fireEvent.click(button('分配任务'))
  await vi.waitFor(()=>expect(draft().value).toBe(''))
  expect(sent[1]).toEqual(sent[0])
  expect(screen.queryByRole('button',{name:'移除本次窗口'})).toBeNull()
  fireEvent.change(draft(),{target:{value:'下一项只写文字'}})
  fireEvent.click(button('分配任务'))
  await vi.waitFor(()=>expect(sent).toHaveLength(3))
  expect(sent[2].desktopTargets).toBeUndefined()
})

it('offers model configuration when an unbound contact previews a window and keeps the native draft untouched',async()=>{
  const id='b'.repeat(64), sent:string[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    const route=url.split('/').at(-1)!;sent.push(route)
    if(route==='desktoptargets')return Response.json({ok:true,value:{targets:[{id,title:'画板',label:'画板',app:'画板',browser:false}]}})
    if(route==='desktoppreview')return Response.json({ok:true,value:{targetId:id,capturedAt:1,image:{dataUrl:'data:image/png;base64,BBBB',width:1,height:1}}})
    return stateResponse('')
  }))
  openDesk(['shan']);await act(async()=>{})
  fireEvent.change(draft(),{target:{value:'保留我的草稿'}})
  fireEvent.click(button('打开角色工作区'))
  await screen.findByRole('option',{name:'画板'})
  fireEvent.change(screen.getByLabelText('本机应用窗口'),{target:{value:id}})
  expect(button('用于本次派工').disabled).toBe(true)
  expect(button('配置角色模型').disabled).toBe(false)
  expect(draft().value).toBe('保留我的草稿')
  expect(sent.includes('run')).toBe(false)
})

it('opens the studio from contacts, binds the chosen characters to a team, dispatches a round, and removes its work record',async()=>{
  const ids=['shan','lu-mi'], roles=Object.fromEntries(ids.map(id=>[id,{model:'model-'+id}]))
  const roomName='海图校对室', calls:{route:string;data:any}[]=[]
  const targetId='e'.repeat(64)
  let rooms:any[]=[], jobs:any[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    const route=url.split('/').at(-1)!, data=JSON.parse(String(init.body))
    calls.push({route,data})
    if(route==='desktoptargets')return Response.json({ok:true,value:{targets:[{id:targetId,label:'地图校对',app:'Editor',title:'校对桌',browser:false}]}})
    if(route==='desktoppreview')return Response.json({ok:true,value:{targetId,capturedAt:123,image:{dataUrl:'data:image/png;base64,AAAA',width:1,height:1}}})
    if (route==='createroom') {
      rooms=[{...data,id:'room-persistent',createdAt:1}]
      return Response.json({ok:true,value:rooms[0]})
    }
    if (route==='run') jobs=[{...data,id:data.requestId,createdAt:2,status:'done',steps:[
      {phase:'review',roleId:'shan',status:'done',model:roles.shan.model,output:'海图已复核'},
    ]}]
    if(route==='deleterecord') {
      jobs=jobs.filter(record=>record.id!==data.id || record.topic!==data.roomId)
      return Response.json({ok:true,value:{ok:true,removed:{jobs:[data.id],letters:[]}}})
    }
    return Response.json({ok:true,value:{rooms,jobs,roles,memories:{},loveHouse:{available:false,connected:false}}})
  }))
  openDesk(ids)
  fireEvent.click(await screen.findByRole('button',{name:'新建工作室'}))
  fireEvent.change(screen.getByLabelText('工作室名称'),{target:{value:roomName}})
  const other=MESSAGE_CHARACTERS.find(role=>role.id==='lu-mi')!
  fireEvent.click(screen.getByRole('checkbox',{name:other.name}))
  fireEvent.change(screen.getByLabelText(other.name+'的分工'),{target:{value:'核对坐标'}})
  fireEvent.click(button('创建工作室'))
  await screen.findByRole('heading',{name:roomName})
  expect(calls.find(call=>call.route==='createroom')?.data).toMatchObject({workflow:'studio',roleIds:ids,duties:{'lu-mi':'核对坐标'}})
  fireEvent.click(button('打开角色工作区'))
  fireEvent.change(screen.getByLabelText('本次操作成员'),{target:{value:'lu-mi'}})
  await screen.findByRole('option',{name:'地图校对'})
  fireEvent.change(screen.getByLabelText('本机应用窗口'),{target:{value:targetId}})
  fireEvent.click(button('用于本次派工'))
  fireEvent.click(button('关闭角色工作区'))
  fireEvent.change(screen.getByRole('textbox',{name:'群消息'}),{target:{value:'复核航线'}})
  fireEvent.click(button('发送到群'))
  await screen.findByText('海图已复核')
  const submitted=calls.find(call=>call.route==='run')!.data
  expect(submitted).toMatchObject({topic:'room-persistent',workflow:'studio',roleIds:ids,mode:'team',desktopTargets:{'lu-mi':targetId}})
  expect(submitted.profiles['lu-mi'].personality).toBe(other.profile.personality)
  expect(submitted.profiles.shan.personality).not.toBe(other.profile.personality)
  fireEvent.click(button('更多回复操作'))
  fireEvent.click(button('管理这条任务'))
  expect(screen.getByText('选中的记录')).toBeTruthy()
  fireEvent.click(button('删除「复核航线」'))
  expect(calls.some(call=>call.route==='deleterecord')).toBe(false)
  fireEvent.click(button('永久删除'))
  await vi.waitFor(()=>expect(screen.queryByText('海图已复核')).toBeNull())
  expect(calls.find(call=>call.route==='deleterecord')?.data).toEqual({kind:'job',id:submitted.requestId,roomId:'room-persistent'})
})

it('keeps the attachment menu open as the desktop service becomes ready', async () => {
  let finish!: (result: Response) => void
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { finish = resolve }))
  openDesk(['shan'])
  fireEvent.click(button('更多聊天操作'))
  expect(button('添加图片或文件').disabled).toBe(true)
  await act(async () => { finish(stateResponse('')) })
  expect(button('添加图片或文件').disabled).toBe(false)
  expect(button('更多聊天操作').getAttribute('aria-expanded')).toBe('true')
})

it('selects and removes files and preserves attachment-only drafts until the host acknowledges submission', async () => {
  const calls: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/state')) return stateResponse('writer')
    calls.push(JSON.parse(String(init.body)))
    return calls.length === 1 ? Response.json({ok:false,error:'请重试本次提交'}, {status:400}) : Response.json({ok:true,value:{}})
  }))
  openDesk(['shan'])
  await act(async () => {})
  const plus = button('更多聊天操作')
  expect(screen.queryByRole('button', {name:'添加图片或文件'})).toBeNull()
  fireEvent.click(plus)
  expect(document.activeElement).toBe(button('添加图片或文件'))
  fireEvent.keyDown(document.activeElement!, {key:'Escape'})
  expect(plus.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(plus)
  fireEvent.click(plus)
  const input = screen.getByLabelText<HTMLInputElement>('选择图片或文件')
  const openPicker = vi.spyOn(input, 'click')
  fireEvent.click(button('添加图片或文件'))
  expect(openPicker).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', {name:'添加图片或文件'})).toBeNull()
  expect(screen.queryByRole('list', {name:'待发送附件'})).toBeNull()
  const file = new File(['题目：今天的菜单'],'题目.txt',{type:'text/plain'})
  fireEvent.change(input, {target:{files:[file]}})
  expect(button('发送').disabled).toBe(false)
  fireEvent.click(button('移除 题目.txt'))
  expect(button('发送').disabled).toBe(true)
  fireEvent.change(input, {target:{files:[file]}})
  fireEvent.click(button('发送'))
  await screen.findByText('请重试本次提交')
  expect(button('移除 题目.txt')).toBeTruthy()
  fireEvent.click(button('发送'))
  await vi.waitFor(() => expect(screen.queryByRole('button',{name:'移除 题目.txt'})).toBeNull())
  expect(calls.map(call => call.requestId)).toEqual([calls[0].requestId,calls[0].requestId])
  expect(Buffer.from(calls[1].attachments[0].data,'base64').toString()).toBe('题目：今天的菜单')
})

it('keeps room attachments in their own composer and sends them only to the selected group member', async () => {
  const room = {id:'room-attachments',name:'周报小组',roleIds:['shan','lu-mi'],createdAt:1}
  const roles = Object.fromEntries(room.roleIds.map(id => [id,{model:'local'}]))
  const calls: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/run')) calls.push(JSON.parse(String(init.body)))
    return Response.json({ok:true,value:{roles,rooms:[room],jobs:[],memories:{},loveHouse:{available:false,connected:false}}})
  }))
  openDesk(room.roleIds)
  const group = await screen.findByRole('button',{name:/周报小组/})
  fireEvent.click(group)
  const file = new File(['会议议程'],'会议.md',{type:'text/markdown'})
  expect(screen.queryByRole('button', {name:'添加图片或文件'})).toBeNull()
  fireEvent.click(button('更多聊天操作'))
  const input = screen.getByLabelText<HTMLInputElement>('选择图片或文件')
  const openPicker = vi.spyOn(input,'click')
  fireEvent.click(button('添加图片或文件'))
  expect(openPicker).toHaveBeenCalledOnce()
  fireEvent.change(input,{target:{files:[file]}})
  fireEvent.click(button('返回私聊'))
  expect(screen.queryByRole('button',{name:'移除 会议.md'})).toBeNull()
  fireEvent.click(group)
  expect(button('移除 会议.md')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox',{name:'群聊发言对象'}),{target:{value:'lu-mi'}})
  fireEvent.click(button('发送到群'))
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0]).toMatchObject({topic:room.id,roleIds:['lu-mi'],mode:'task',text:''})
  expect(Buffer.from(calls[0].attachments[0].data,'base64').toString()).toBe('会议议程')
})

it('opens the bedroom task shortcut on single assignment, and an office visit returns the same employee to normal chat', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(stateResponse(''))))
  const desk = openDesk()
  await act(async () => {})
  expect(screen.getByText('一对一聊天')).toBeTruthy()
  desk.visit('task')
  expect(button('返回聊天')).toBeTruthy()
  expect(screen.queryByRole('button', {name:'添加图片或文件'})).toBeNull()
  fireEvent.click(button('更多聊天操作'))
  expect(button('添加图片或文件').disabled).toBe(false)
  fireEvent.pointerDown(draft())
  expect(screen.queryByRole('button', {name:'添加图片或文件'})).toBeNull()
  fireEvent.change(draft(), { target: { value:'草拟工作清单' } })
  fireEvent.click(button('分配任务'))
  expect(desk.send).toHaveBeenCalledWith('task')
  desk.visit('chat')
  expect(screen.queryByRole('button', {name:'返回聊天'})).toBeNull()
  expect(draft().value).toBe('草拟工作清单')
})

it('keeps the draft until the user picks DSH, then uses native chat and tasks through an outage and recovery', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(outage()).mockResolvedValueOnce(stateResponse('writer'))
  vi.stubGlobal('fetch', fetcher)
  const desk = openDesk()
  await screen.findByText('员工服务连接中断')
  fireEvent.change(draft(), { target: { value: '保留这段草稿' } })
  expect(button('发送').disabled).toBe(true)
  fireEvent.submit(draft().form!)
  expect(desk.send).not.toHaveBeenCalled()
  fireEvent.click(button('使用 DSH 会话'))
  fireEvent.click(button('发送'))
  fireEvent.click(button('更多聊天操作'))
  fireEvent.click(button('单人派工'))
  fireEvent.click(button('分配任务'))
  expect(desk.send.mock.calls).toEqual([['chat'], ['task']])
  fireEvent.click(button('更多聊天操作'))
  fireEvent.click(button('协作交接'))
  fireEvent.click(screen.getByRole('checkbox', { name: '白霜命' }))
  expect(button('开始协作').disabled).toBe(true)
  await act(async () => fireEvent.click(button('重试员工服务')))
  expect(screen.queryByText('员工服务连接中断')).toBeNull()
  fireEvent.click(button('更多聊天操作'))
  fireEvent.click(button('聊天'))
  fireEvent.click(button('聊天设置'))
  fireEvent.click(button('新对话'))
  fireEvent.click(button('关闭聊天设置'))
  fireEvent.click(button('发送'))
  expect(desk.newTopic).toHaveBeenCalledOnce()
  expect(desk.send.mock.calls.at(-1)).toEqual(['chat'])
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/luma-agents/state','/luma-agents/state','/luma-agents/cloudstate'])
})

it('can select DSH while the initial service lookup is pending and keeps it when the lookup finishes', async () => {
  vi.useFakeTimers()
  let complete!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve })))
  const desk = openDesk()
  expect(screen.queryByText('使用 DSH 会话')).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(3001))
  fireEvent.change(draft(), { target: { value: '回复测试' } })
  expect(button('发送').disabled).toBe(true)
  fireEvent.click(button('使用 DSH 会话'))
  fireEvent.click(button('发送'))
  await act(async () => complete(stateResponse('configured-independent-model')))
  fireEvent.click(button('聊天设置'))
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '历史对话' }).value).toBe('native:')
  expect(desk.send).toHaveBeenCalledWith('chat')
})

it('keeps an independent draft and request ID after a lost response; removing its service never redirects to DSH', async () => {
  const runs: { requestId: string; text: string }[] = []
  let model = 'writer'
  let online = true
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith('/run')) {
      runs.push(JSON.parse(String(options.body)))
      if (runs.length === 1) throw Error('响应已断开')
      return Response.json({ ok: true, value: {} })
    }
    return online ? stateResponse(model) : outage()
  }))
  const desk = openDesk()
  await act(async () => {})
  fireEvent.change(draft(), { target: { value: '交付工作' } })
  fireEvent.click(button('发送'))
  await screen.findByText('响应已断开')
  expect(draft().value).toBe('交付工作')

  online = false
  desk.reopen()
  await screen.findByText('员工服务连接中断')
  expect(button('发送').disabled).toBe(true)
  fireEvent.submit(draft().form!)
  expect(runs).toHaveLength(1)
  online = true
  await act(async () => fireEvent.click(button('重试员工服务')))
  await act(async () => fireEvent.click(button('发送')))
  expect(runs).toHaveLength(2)
  expect(runs[1]).toEqual(runs[0])
  expect(draft().value).toBe('')

  model = ''
  desk.reopen()
  await screen.findByText(/这段工作记录使用独立服务/u)
  fireEvent.change(draft(), { target: { value: '留待恢复' } })
  fireEvent.submit(draft().form!)
  expect(button('发送').disabled).toBe(true)
  expect(desk.send).not.toHaveBeenCalled()
  expect(runs).toHaveLength(2)
})

it('shows recent private messages in the contact list and keeps role settings and work actions behind their own buttons', async () => {
  const snapshot = {roles:{shan:{model:'private-model'}}, jobs:[{id:'msg',roleIds:['shan'],topic:'desk-shan',mode:'chat',text:'今晚见',createdAt:100,status:'done',steps:[{roleId:'shan',status:'done',output:'晚上见呀'}]}],
    previews:{shan:{text:'晚上见呀',time:100}}, rooms:[], memories:{}, loveHouse:{connected:false,available:false}}
  vi.stubGlobal('fetch', vi.fn(async (url:string) => Response.json({ok:true,value:url.endsWith('/memory') ? {entries:[]} : snapshot})))
  openDesk(['shan'])
  await screen.findByText('晚上见呀', { selector:'.lumaMessageBubble.is-assistant p' })
  expect(screen.getByText('晚上见呀', {selector:'.lumaContactPreview small'})).toBeTruthy()
  expect(screen.getByText('今晚见', {selector:'.lumaMessageBubble.is-user p'})).toBeTruthy()
  expect(screen.queryByText('白霜命')).toBeNull()
  expect(screen.queryByText('人格设定')).toBeNull()
  expect(screen.queryByText('API 服务')).toBeNull()
  expect(screen.queryByText('协作交接')).toBeNull()
  fireEvent.click(button('聊天设置'))
  fireEvent.click(button('记忆库'))
  expect(screen.getByRole('heading',{name:'端木嫣的记忆库'})).toBeTruthy()
  fireEvent.click(button('关闭记忆库'))
  fireEvent.click(button('更多聊天操作'))
  expect(button('邀请伙伴组群')).toBeTruthy()
})
