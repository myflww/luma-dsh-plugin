import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { RoomConversation } from '../src/client/WorkRooms.tsx'
import { MESSAGE_CHARACTERS, type MessagesSnapshot } from '../src/client/messages-runtime.ts'
import { DEFAULT_MESSAGE_PREFERENCES } from '../src/messages-settings.ts'
import type { AgentState, WorkRoom } from '../src/client/agent-desk-api.ts'

const ids=['shan','lu-mi','jingyuniang','grok']
const room:WorkRoom={id:'round-dispatch-ui',name:'海岸设计室',roleIds:ids,createdAt:1,workflow:'studio'}
const names=Object.fromEntries(MESSAGE_CHARACTERS.map(person=>[person.id,person.name]))
const roles=Object.fromEntries(ids.map(id=>[id,{model:'model-'+id,source:'dsh' as const,hasKey:false,baseUrl:''}]))
const windows=[
  {id:'a'.repeat(64),label:'航线 · msedge.exe',browser:true,app:'msedge.exe'},
  {id:'b'.repeat(64),label:'图例 · notepad.exe',browser:false,app:'notepad.exe'},
]
const snapshot:MessagesSnapshot={roleId:'shan',profile:MESSAGE_CHARACTERS[0]!.profile,preferences:DEFAULT_MESSAGE_PREFERENCES,
  topics:[],messages:[],writable:true,pending:false,running:false,attention:false,hasMore:false,loading:false}
const ok=(value:unknown)=>Response.json({ok:true,value})
const groupTools=()=>within(screen.getByRole('group',{name:'工作室工具'}))
const selectWindow=(id:string,token:string)=>fireEvent.change(screen.getByLabelText(names[id]+'本次可操作的窗口'),{target:{value:token}})
function show(state:AgentState['roles']=roles){
  return render(<RoomConversation room={room} names={names} state={{roles:state,memories:{},jobs:[],loveHouse:{available:false,connected:false}}}
    snapshot={snapshot} files={[]} refresh={async()=>{}} close={()=>{}} changeFiles={()=>{}}/>)
}
beforeAll(()=>{HTMLElement.prototype.scrollTo=()=>{}})
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals()})

it('uses the four actual room portraits, shows the lead model and switches exclusively between the workspace and model settings',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>ok({providers:[],models:[],targets:[],url:'',jobs:[]})))
  const state={...roles,'lu-mi':{...roles['lu-mi']!,model:''}}
  const view=show(state)
  const header=groupTools().getByRole('button',{name:'配置'+names.shan+'的模型'})
  expect(header.title).toContain(roles.shan!.model)
  expect(header.querySelector('[data-kind=dsh]')).toBeTruthy()
  const portraits=view.container.querySelectorAll('.lumaMessageToolbar .lumaRoomFaces img')
  expect(portraits).toHaveLength(4)
  expect(new Set(Array.from(portraits,image=>image.getAttribute('src'))).size).toBe(4)
  fireEvent.click(header)
  expect(header.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByLabelText('员工 API 服务').querySelector('header')?.textContent).toContain(names.shan)
  fireEvent.click(groupTools().getByRole('button',{name:'打开角色工作区'}))
  expect(screen.getByLabelText('角色工作区')).toBeTruthy()
  expect(screen.queryByLabelText('员工 API 服务')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:names['lu-mi']+' · 配置'}))
  expect(screen.getByLabelText('员工 API 服务').querySelector('header')?.textContent).toContain(names['lu-mi'])
  expect(screen.queryByLabelText('角色工作区')).toBeNull()
  await act(async()=>{})
})

it('assigns native window controls per visible member, shows shared-window sequencing and clears grants when recipients change',async()=>{
  const submits:Record<string,unknown>[]=[]
  let targets=windows
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    if(url.endsWith('/run'))submits.push(JSON.parse(String(init.body)))
    return ok(url.endsWith('/desktoptargets')?{targets}:{})
  }))
  const view=show()
  const summary=view.container.querySelector<HTMLDetailsElement>('.lumaStudioDesktopPicker')!
  fireEvent.click(within(summary).getByText('本次电脑操作'))
  const first=await screen.findByRole('combobox',{name:names.shan+'本次可操作的窗口'})
  await within(first).findByRole('option',{name:windows[0]!.label})
  selectWindow('shan',windows[0]!.id)
  selectWindow('lu-mi',windows[0]!.id)
  expect(screen.getAllByText('依次操作')).toHaveLength(2)
  expect(summary.querySelectorAll('[data-kind=web]')).toHaveLength(2)
  selectWindow('lu-mi',windows[1]!.id)
  expect(screen.queryByText('依次操作')).toBeNull()
  expect(summary.querySelector('[data-kind=document]')).toBeTruthy()
  targets=windows.slice(1)
  fireEvent.click(screen.getByRole('button',{name:'刷新窗口'}))
  await screen.findByRole('option',{name:'已选窗口暂不可用'})
  const cast=screen.getByRole('group',{name:'点名工作室成员'})
  expect(within(cast).getAllByRole('button')).toHaveLength(4)
  const nominate=within(cast).getByRole('button',{name:'点名'+names['lu-mi']+'接手任务'})
  fireEvent.click(nominate)
  expect(nominate.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole<HTMLSelectElement>('combobox',{name:'群聊发言对象'}).value).toBe('lu-mi')
  expect(screen.queryByRole('combobox',{name:names.shan+'本次可操作的窗口'})).toBeNull()
  const only=screen.getByRole<HTMLSelectElement>('combobox',{name:names['lu-mi']+'本次可操作的窗口'})
  expect(only.value).toBe('')
  expect(view.container.querySelector('.lumaRoomRecipient > .lumaMessageAvatar')).toBeTruthy()
  selectWindow('lu-mi',windows[1]!.id)
  fireEvent.change(screen.getByRole('textbox',{name:'群消息'}),{target:{value:'整理图例'}})
  fireEvent.click(screen.getByRole('button',{name:'发送到群'}))
  await vi.waitFor(()=>expect(submits).toHaveLength(1))
  expect(submits[0]).toMatchObject({mode:'task',roleIds:['lu-mi'],desktopTargets:{'lu-mi':windows[1]!.id}})
})

it('selects the independent reviewer from available colleagues and sends one studio task with both windows',async()=>{
  const submits:Record<string,unknown>[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    if(url.endsWith('/run'))submits.push(JSON.parse(String(init.body)))
    return ok(url.endsWith('/desktoptargets')?{targets:windows}:{})
  }))
  const view=show()
  fireEvent.click(within(view.container.querySelector('.lumaStudioDesktopPicker')!).getByText('本次电脑操作'))
  const win=await screen.findByRole('combobox',{name:names['lu-mi']+'本次可操作的窗口'})
  await within(win).findByRole('option',{name:windows[0]!.label})
  selectWindow('lu-mi',windows[0]!.id)
  const review=screen.getByRole<HTMLSelectElement>('combobox',{name:'本轮窗口复核人'})
  expect(Array.from(review.options,x=>x.value)).toEqual(['','jingyuniang','grok'])
  fireEvent.change(review,{target:{value:'grok'}})
  selectWindow('jingyuniang',windows[1]!.id)
  expect(Array.from(review.options,x=>x.value)).toEqual(['grok'])
  expect(review.value).toBe('grok')
  fireEvent.change(screen.getByRole('textbox',{name:'群消息'}),{target:{value:'两窗各自确认后复核。'}})
  fireEvent.click(screen.getByRole('button',{name:'发送到群'}))
  await vi.waitFor(()=>expect(submits).toHaveLength(1))
  expect(submits[0]).toMatchObject({mode:'team',workflow:'studio',reviewerId:'grok',desktopTargets:{'lu-mi':windows[0]!.id,jingyuniang:windows[1]!.id}})
})
