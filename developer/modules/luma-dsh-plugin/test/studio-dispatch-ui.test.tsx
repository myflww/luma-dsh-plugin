import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { RoomConversation } from '../src/client/WorkRooms.tsx'
import { ReplyToolsProvider } from '../src/client/ReplyTools.tsx'
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
const capabilityTrigger=()=>screen.getByRole('button',{name:/^工作室能力，当前/})
function openCapability(label:string){
  fireEvent.click(capabilityTrigger())
  fireEvent.click(screen.getByRole('button',{name:label,exact:true}))
}
const closeCapabilities=()=>fireEvent.click(screen.getByRole('button',{name:'关闭工作室能力'}))
const selectWindow=(id:string,token:string)=>fireEvent.change(screen.getByLabelText(names[id]+'本次可操作的窗口'),{target:{value:token}})
function show(state:AgentState['roles']=roles){
  return render(<RoomConversation room={room} names={names} state={{roles:state,memories:{},jobs:[],loveHouse:{available:false,connected:false}}}
    snapshot={snapshot} files={[]} refresh={async()=>{}} close={()=>{}} changeFiles={()=>{}}/>)
}
beforeAll(()=>{HTMLElement.prototype.scrollTo=()=>{}})
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals()})

it('keeps feedback for an original reply separate from that same speaker answering a colleague',()=>{
  const steps=['shan','lu-mi','shan'].map((roleId,i)=>({roleId,status:'done' as const,output:'公开回复 '+i}))
  const job={id:'followup',topic:room.id,mode:'chat' as const,text:'各位怎么看？',roleIds:ids,status:'done' as const,createdAt:1,steps}
  render(<ReplyToolsProvider reactions={{'reply/job/followup/shan/relay':'up'}}><RoomConversation room={room} names={names}
    state={{roles,memories:{},jobs:[job],loveHouse:{available:false,connected:false}}}
    snapshot={snapshot} files={[]} refresh={async()=>{}} close={()=>{}} changeFiles={()=>{}}/></ReplyToolsProvider>)
  const votes=screen.getAllByRole('button',{name:'有帮助'})
  expect(votes.map(button=>button.getAttribute('aria-pressed'))).toEqual(['true','false','false'])
})

it('asks for a recipient before sharing an attachment when everyone already answered',()=>{
  const steps=ids.map(roleId=>({roleId,status:'done' as const,output:'我说过自己的选择了。'}))
  const job={id:'answered',topic:room.id,mode:'chat' as const,text:'你们分别说说？',roleIds:ids,status:'done' as const,createdAt:1,steps}
  render(<RoomConversation room={room} names={names} state={{roles,memories:{},jobs:[job],loveHouse:{available:false,connected:false}}}
    snapshot={snapshot} files={[new File(['草图'],'草图.txt',{type:'text/plain'})]} refresh={async()=>{}} close={()=>{}} changeFiles={()=>{}}/>)
  fireEvent.change(screen.getByRole('textbox',{name:'群消息'}),{target:{value:'其他人呢'}})
  expect(screen.getByText('大家都已经回答过了。请点名选择这份附件的接收人。')).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button',{name:'发送到群'}).disabled).toBe(true)
})

it('renders only published chat replies and shows one quiet-turn notice if nobody has new content',()=>{
  const steps=ids.slice(0,2).map(roleId=>({roleId,status:'done' as const,output:''}))
  const base={mode:'chat' as const,topic:room.id,roleIds:ids.slice(0,2),createdAt:1,status:'done' as const}
  const jobs=[{...base,id:'one',text:'你好',steps:[{...steps[0]!,output:'我在。'},steps[1]!]},
    {...base,id:'quiet',text:'还有呢？',steps}]
  const view=render(<RoomConversation room={room} names={names} state={{roles,jobs,memories:{},loveHouse:{available:false,connected:false}}}
    snapshot={snapshot} files={[]} refresh={async()=>{}} close={()=>{}} changeFiles={()=>{}}/>)
  expect(view.container.querySelectorAll('.lumaMessageBubble.is-assistant')).toHaveLength(1)
  expect(screen.getByText('这轮没有新的补充。')).toBeTruthy()
})

it('opens a studio in ordinary chat, follows explicit mentions and still offers a text-only task',async()=>{
  const submits:Record<string,unknown>[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    if(url.endsWith('/run'))submits.push(JSON.parse(String(init.body)))
    return ok({})
  }))
  show()
  const send=async(text:string)=>{
    fireEvent.change(screen.getByRole('textbox',{name:'群消息'}),{target:{value:text}})
    fireEvent.click(screen.getByRole('button',{name:'发送到群'}))
    await act(async()=>{})
    return submits.at(-1)
  }
  expect(capabilityTrigger().textContent).toContain('群聊')
  expect(await send('hello，大家好')).toMatchObject({mode:'chat',roleIds:ids,roomRequired:1})
  expect(await send('我们来分配岗位，你们自己告诉我，你们适合做什么岗位')).toMatchObject({mode:'chat',roleIds:ids,roomRequired:ids.length})
  expect(await send('@'+names['lu-mi']+'，@'+names.grok+' 你们觉得呢？')).toMatchObject({mode:'chat',roleIds:['lu-mi','grok']})
  openCapability('点名派工');fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:names['lu-mi'],exact:true}))
  expect(await send('写一份完整的校对意见')).toMatchObject({mode:'task',roleIds:['lu-mi']})
})

it('shows help for each capability on hover, focus or tap and restores keyboard focus after dismissal',()=>{
  show()
  const trigger=capabilityTrigger()
  fireEvent.click(trigger)
  const dialog=screen.getByRole('dialog',{name:'工作室能力'})
  for(const label of ['群聊','点名聊天','全员分工','全员接力','点名派工','电脑操作']){
    const help=within(dialog).getByRole('button',{name:label+'说明'})
    fireEvent.pointerEnter(help)
    const tooltip=screen.getByRole('tooltip')
    expect(help.getAttribute('aria-describedby')).toBe(tooltip.id)
    expect(tooltip.textContent).toContain(label)
    expect(tooltip.closest('.lumaCapabilityScroll')).toBeNull()
    fireEvent.keyDown(help,{key:'Escape'})
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(()=>help.focus())
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(help,{key:'Escape'})
    fireEvent.click(help)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(help,{key:'Escape'})
    expect(dialog.open).toBe(true)
  }
  fireEvent.keyDown(dialog,{key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

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
  openCapability('电脑操作')
  const summary=screen.getByRole('dialog',{name:'电脑操作'})
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
  closeCapabilities()
  const cast=screen.getByRole('group',{name:'点名工作室成员'})
  expect(within(cast).getAllByRole('button')).toHaveLength(4)
  const nominate=within(cast).getByRole('button',{name:'点名'+names['lu-mi']+'聊天'})
  fireEvent.click(nominate)
  expect(nominate.getAttribute('aria-pressed')).toBe('true')
  expect(capabilityTrigger().textContent).toContain('点名聊天 · '+names['lu-mi'])
  openCapability('电脑操作')
  expect(screen.queryByRole('combobox',{name:names.shan+'本次可操作的窗口'})).toBeNull()
  const only=screen.getByRole<HTMLSelectElement>('combobox',{name:names['lu-mi']+'本次可操作的窗口'})
  await within(only).findByRole('option',{name:windows[1]!.label})
  expect(only.value).toBe('')
  expect(view.container.querySelector('.lumaRoomRecipient > .lumaMessageAvatar')).toBeTruthy()
  selectWindow('lu-mi',windows[1]!.id)
  closeCapabilities()
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
  openCapability('电脑操作')
  const win=await screen.findByRole('combobox',{name:names['lu-mi']+'本次可操作的窗口'})
  await within(win).findByRole('option',{name:windows[0]!.label})
  selectWindow('lu-mi',windows[0]!.id)
  closeCapabilities()
  const review=screen.getByRole<HTMLSelectElement>('combobox',{name:'本轮窗口复核人'})
  expect(Array.from(review.options,x=>x.value)).toEqual(['','jingyuniang','grok'])
  fireEvent.change(review,{target:{value:'grok'}})
  openCapability('电脑操作')
  await within(screen.getByLabelText(names.jingyuniang+'本次可操作的窗口')).findByRole('option',{name:windows[1]!.label})
  selectWindow('jingyuniang',windows[1]!.id);closeCapabilities()
  expect(Array.from(review.options,x=>x.value)).toEqual(['grok'])
  expect(review.value).toBe('grok')
  fireEvent.change(screen.getByRole('textbox',{name:'群消息'}),{target:{value:'两窗各自确认后复核。'}})
  fireEvent.click(screen.getByRole('button',{name:'发送到群'}))
  await vi.waitFor(()=>expect(submits).toHaveLength(1))
  expect(submits[0]).toMatchObject({mode:'team',workflow:'studio',reviewerId:'grok',desktopTargets:{'lu-mi':windows[0]!.id,jingyuniang:windows[1]!.id}})
})
