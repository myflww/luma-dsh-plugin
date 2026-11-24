import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ContactRecords } from '../src/client/ContactRecords.tsx'
import type { AgentJob } from '../src/client/agent-desk-api.ts'
import type { MessagesRuntime, MessagesSnapshot } from '../src/client/messages-runtime.ts'

const names={shan:'端木嫣','lu-mi':'陆弥'}
const job=(id:string,topic:string,text:string):AgentJob=>({id,text,topic,roleIds:['shan'],mode:'task',status:'done',createdAt:1,steps:[{roleId:'shan',status:'done',output:'整理完成'}]})
const room={scope:{roomId:'本群'},name:'书稿工作室',names,available:true,write:true,refresh:vi.fn(async()=>{}),close:vi.fn()}
const click=(label:string)=>fireEvent.click(screen.getByRole('button',{name:label,exact:true}))
const ok=(value:unknown)=>Response.json({ok:true,value})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks()})

it('reads an archived room job and restores only its owner-scoped record',async()=>{
  const original=job('目标','本群','校样批次'),requests:any[]=[]
  let archived=false
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    const args=JSON.parse(String(init.body));const action=url.split('/').pop();requests.push([action,args])
    if(action==='archivedrecords')return ok({items:archived?[{kind:'job',id:'目标',topic:'本群',roomId:'本群',roleIds:['shan'],title:'校样批次',archivedAt:9,count:1,mode:'task'}]:[]})
    if(action==='readrecord')return ok({jobs:[original],letters:[]})
    if(action==='archiverecord')archived=true
    if(action==='restorerecord')archived=false
    return ok({ok:true})
  }))
  render(<ContactRecords {...room} jobs={[original,job('其他','另一个群','不属于本群')]}/>)
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'关闭记录管理'}))
  expect(screen.queryByText('不属于本群')).toBeNull()
  click('归档「校样批次」')
  await screen.findByText('已移入归档。')
  click('已归档');await screen.findByText('校样批次')
  click('查看「校样批次」');await screen.findByText('整理完成')
  expect(requests).toContainEqual(['readrecord',{kind:'job',id:'目标',roomId:'本群'}])
  click('恢复「校样批次」');await screen.findByText('还没有归档记录。')
  expect(requests).toContainEqual(['restorerecord',{kind:'job',id:'目标',roomId:'本群'}])
})

it('confirms the specific job rather than a similarly named item or the parent topic and keeps blocked actions inert',async()=>{
  const requested:any[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{requested.push([url,JSON.parse(String(init.body))]);return ok({ok:true,removed:{jobs:['第二份'],letters:[]}})}))
  const forget=vi.fn()
  const j1=job('第一份','同一话题','校样批次'),j2=job('第二份','同一话题','重新标号')
  render(<ContactRecords {...room} scope={{roleId:'shan'}} forgetReplyMarks={forget} jobs={[j1,j2,{...job('跑着','进行中','正在打印'),status:'running'}]}/>)
  expect(screen.getByRole<HTMLButtonElement>('button',{name:'删除「正在打印」'}).disabled).toBe(true)
  click('查看「校样批次」')
  click('删除「重新标号」')
  const confirm=screen.getByRole('dialog',{name:'永久删除记录？'})
  expect(within(confirm).getByText('重新标号')).toBeTruthy()
  expect(document.activeElement).toBe(within(confirm).getByRole('button',{name:'取消'}))
  click('取消');expect(requested).toHaveLength(0)
  click('删除「重新标号」');click('永久删除')
  await screen.findByText('记录已永久删除。')
  expect(requested).toEqual([['/luma-agents/deleterecord',{kind:'job',id:'第二份',roleId:'shan'}]])
  expect(forget).toHaveBeenCalledExactlyOnceWith({jobs:['第二份'],letters:[]})
  fireEvent.keyDown(screen.getByRole('complementary'),{key:'Escape'});expect(room.close).toHaveBeenCalledOnce()
})

it('offers only supported native actions; archive, restore and open always address the selected native session',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>ok({items:[]})))
  const archiveTopic=vi.fn(async()=>true),restoreTopic=vi.fn(async()=>true),open=vi.fn(async()=>{})
  const native={state:{topics:[{id:'a',title:'DSH 原稿'}],archivedTopics:[{id:'b',title:'DSH 旧稿'}],archivableTopics:['a'],canRestoreNative:true} as unknown as MessagesSnapshot,
    runtime:{archiveTopic,restoreTopic} as unknown as MessagesRuntime,open}
  const base={...room,scope:{roleId:'shan'},jobs:[]}
  const view=render(<ContactRecords {...base} native={native}/>)
  click('打开');expect(open).toHaveBeenCalledWith('a')
  click('归档「DSH 原稿」');await screen.findByText('DSH 对话已归档。')
  expect(archiveTopic).toHaveBeenCalledWith('a','shan')
  click('已归档');await screen.findByText('DSH 旧稿')
  expect(screen.queryByRole('button',{name:/删除/})).toBeNull()
  click('恢复「DSH 旧稿」');await screen.findByText('DSH 对话已恢复。')
  expect(restoreTopic).toHaveBeenCalledWith('b','shan')
  view.rerender(<ContactRecords {...base} native={{...native,state:{...native.state,canRestoreNative:false}}}/>)
  expect(screen.queryByRole('button',{name:'恢复「DSH 旧稿」'})).toBeNull()
})
