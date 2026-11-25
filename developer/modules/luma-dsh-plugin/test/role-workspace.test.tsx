import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RoleWorkspacePanel } from '../src/client/RoleWorkspacePanel.tsx'
import type { AgentJob } from '../src/client/agent-desk-api.ts'

afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks()})
const config={model:'studio-model',baseUrl:'',hasKey:false}
const props={title:'鸭川工作室',members:[{id:'shan',name:'珊',config},{id:'lu-mi',name:'露米',config}],
  eligibleIds:['shan','lu-mi'],jobs:[] as AgentJob[],names:{shan:'珊','lu-mi':'露米'},assignments:{},active:true,canAssign:true,canWrite:true,
  onAssign:vi.fn(),onClose:vi.fn(),onConfigure:vi.fn()}
const page='c'.repeat(64),app='d'.repeat(64)
const targets=[{id:page,label:'Edge · 校样',app:'Edge',title:'校样',browser:true},{id:app,label:'记事本',app:'Notepad',title:'稿',browser:false}]
const reply=(value:unknown)=>Response.json({ok:true,value})
async function drain(){await act(async()=>{for(let n=0;n<5;n++)await Promise.resolve()})}

it('moves keyboard focus across views, returns to the local window picker and opens the real cloud dialog',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>reply(url.endsWith('/cloudstate')?{url:'',jobs:[]}:{targets})))
  render(<RoleWorkspacePanel {...props}/>)
  await drain()
  const tab=(name:string)=>screen.getByRole('tab',{name,exact:true})
  expect(document.activeElement).toBe(tab('屏幕'))
  fireEvent.keyDown(tab('屏幕'),{key:'End'})
  expect(document.activeElement).toBe(tab('文件'))
  expect(screen.getByRole('tabpanel',{name:'文件'})).toBeTruthy()
  fireEvent.keyDown(tab('文件'),{key:'ArrowRight'})
  expect(document.activeElement).toBe(tab('屏幕'))
  fireEvent.keyDown(tab('屏幕'),{key:'ArrowRight'})
  expect(document.activeElement).toBe(tab('浏览器'))
  fireEvent.click(screen.getByRole('button',{name:'选择本机窗口'}))
  await drain()
  expect(document.activeElement).toBe(screen.getByLabelText('本机应用窗口'))
  fireEvent.click(screen.getByRole('button',{name:'云电脑'}))
  await drain()
  expect(screen.getByRole('dialog',{name:'珊的云电脑'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'关闭云电脑'}))
  expect(screen.getByRole('tabpanel',{name:'屏幕'})).toBeTruthy()
})

it('filters browser windows, reads accessibility data, aborts a hidden preview, and does not poll an inactive tab',async()=>{
  vi.useFakeTimers()
  let hidden=false, captures=0, held:AbortSignal|undefined
  vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden)
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    if(url.endsWith('/desktoptargets')) return reply({targets})
    if(url.endsWith('/cloudstate'))return reply({url:'',jobs:[]})
    const body=JSON.parse(String(init.body))
    expect(body).toEqual({targetId:page,view:'browser'})
    captures++
    if(captures===2){held=init.signal!;return new Promise<Response>(()=>{})}
    return reply({targetId:page,title:'校样',app:'Edge',capturedAt:12345,image:{dataUrl:'data:image/png;base64,AAAA',width:100,height:90},content:[{role:'link',name:'目录页',value:'第六章'}]})
  }))
  render(<RoleWorkspacePanel {...props}/>)
  await drain()
  fireEvent.click(screen.getByRole('tab',{name:'浏览器',exact:true}))
  await drain()
  expect(screen.queryByRole('option',{name:'记事本'})).toBeNull()
  fireEvent.change(screen.getByLabelText('本次操作成员'),{target:{value:'lu-mi'}})
  await drain()
  fireEvent.change(screen.getByLabelText('浏览器窗口'),{target:{value:page}})
  await drain()
  expect(screen.getByText('目录页')).toBeTruthy()
  expect(screen.getByText('第六章')).toBeTruthy()
  expect(screen.getByRole('img',{name:'Edge · 校样的实时窗口预览'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'用于本次派工'}))
  expect(props.onAssign).toHaveBeenCalledWith('lu-mi',page,'Edge · 校样')
  await act(async()=>{await vi.advanceTimersByTimeAsync(2501)})
  expect(captures).toBe(2)
  hidden=true
  act(()=>document.dispatchEvent(new Event('visibilitychange')))
  expect(held?.aborted).toBe(true)
  expect(screen.queryByRole('img',{name:/实时窗口预览/})).toBeNull()
  await act(async()=>{await vi.advanceTimersByTimeAsync(8000)})
  expect(captures).toBe(2)
  hidden=false
  act(()=>document.dispatchEvent(new Event('visibilitychange')))
  await drain();expect(captures).toBe(3)
  fireEvent.click(screen.getByRole('tab',{name:'数据',exact:true}))
  await act(async()=>{await vi.advanceTimersByTimeAsync(8000)})
  expect(captures).toBe(3)
})

it('reports role-wide task progress and exports only completed artifacts from the open conversation',async()=>{
  const job:AgentJob={id:'current',topic:'one',mode:'team',roleIds:['shan','lu-mi'],text:'排版校样',createdAt:10,status:'running',steps:[
    {roleId:'shan',status:'done',phase:'plan',output:'排版要求。'},
    {roleId:'lu-mi',status:'running',phase:'work',activity:'检查目录',output:''}
  ]}
  const elsewhere:AgentJob={...job,id:'elsewhere',topic:'two',text:'另一会话任务'}
  vi.stubGlobal('fetch',vi.fn(async()=>reply({targets:[]})))
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  const createUrl=vi.fn(()=> 'blob:workspace-output')
  vi.stubGlobal('URL',class extends URL {static createObjectURL=createUrl;static revokeObjectURL=()=>{}})
  render(<RoleWorkspacePanel {...props} jobs={[job]} roleJobs={[job,elsewhere]}/>)
  fireEvent.click(screen.getByRole('tab',{name:'数据',exact:true}))
  expect(screen.getByText('排版校样')).toBeTruthy()
  expect(screen.getByText('另一会话任务')).toBeTruthy()
  expect(screen.getAllByText('1 / 2 步')).toHaveLength(2)
  expect(screen.getAllByText('露米 · 检查目录')).toHaveLength(2)
  fireEvent.click(screen.getByRole('tab',{name:'文件',exact:true}))
  const list=screen.getByRole('list')
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  expect(screen.queryByText('另一会话任务')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'导出珊的第1步交付'}))
  expect(createUrl).toHaveBeenCalledOnce();expect(click).toHaveBeenCalledOnce()
  expect((click.mock.instances[0] as HTMLAnchorElement).download).toContain('Luma-shan')
})
