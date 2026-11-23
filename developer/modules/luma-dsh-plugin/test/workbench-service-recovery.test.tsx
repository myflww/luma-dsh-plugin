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
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/luma-agents/state', '/luma-agents/state'])
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
