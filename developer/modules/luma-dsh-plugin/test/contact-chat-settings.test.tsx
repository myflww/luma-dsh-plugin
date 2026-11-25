import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ContactChatSettings } from '../src/client/ContactChatSettings.tsx'
import { MESSAGE_CHARACTERS, type MessagesSnapshot } from '../src/client/messages-runtime.ts'
import { DEFAULT_MESSAGE_PREFERENCES } from '../src/messages-settings.ts'

afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const role=MESSAGE_CHARACTERS[0]
const state:MessagesSnapshot={preferences:DEFAULT_MESSAGE_PREFERENCES,roleId:role.id,profile:role.profile,topics:[],messages:[],
  running:false,pending:false,writable:true,loading:false,attention:false,hasMore:false}
const props={
  state,model:'本机校对模型',deskReady:true,memoryCount:3,history:'native:',historyOptions:<><option value="native:">DSH 对话</option><option value="desk:work">校对任务</option></>,
  historyBusy:false,canCreate:true,canExport:true,onSection:vi.fn(),onClose:vi.fn(),onHistory:vi.fn(),onCreate:vi.fn(),onDisplay:vi.fn(),onExport:vi.fn(),onNative:vi.fn()
}
const button=(name:string)=>screen.getByRole<HTMLButtonElement>('button',{name,exact:true})

it('opens the real role tools and sends history, reading mode and secondary commands to their owning actions',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true,value:{url:'',jobs:[]}})))
  render(<ContactChatSettings {...props}/>)
  expect(document.activeElement).toBe(button('关闭聊天设置'))
  for(const [label,section] of [['模型服务','api'],['人格设定','persona'],['记忆库','memory']]){
    fireEvent.click(button(label));expect(props.onSection).toHaveBeenLastCalledWith(section)
  }
  expect(button('模型服务').getAttribute('aria-describedby')).toBe(screen.getByText('本机校对模型').id)
  expect(screen.getByText('本机 3 条记录')).toBeTruthy()
  fireEvent.click(button('云电脑'))
  await screen.findByText('尚未连接云办公服务器。',{exact:false})
  fireEvent.click(button('关闭云电脑'))
  fireEvent.click(button('新对话'));expect(props.onCreate).toHaveBeenCalledOnce()
  fireEvent.change(screen.getByLabelText('历史对话'),{target:{value:'desk:work'}});expect(props.onHistory).toHaveBeenCalledWith('desk:work')
  fireEvent.click(screen.getByRole('radio',{name:'阅读模式'}));expect(props.onDisplay).toHaveBeenCalledWith('novel')
  const more=screen.getByText('更多会话工具').closest('details')!
  expect(more.open).toBe(false)
  fireEvent.click(screen.getByText('更多会话工具'));expect(more.open).toBe(true)
  fireEvent.click(button('导出对话'));fireEvent.click(button('原生会话与模型设置'))
  expect(props.onExport).toHaveBeenCalledOnce();expect(props.onNative).toHaveBeenCalledOnce()
})

it('restores keyboard focus and accurately reports unavailable services in a read-only profile',async()=>{
  function Fixture(){
    const [open,setOpen]=useState(false)
    return <><button onClick={()=>setOpen(true)}>设置入口</button>{open && <ContactChatSettings {...props}
      state={{...state,writable:false}} deskReady={false} memoryCount={undefined} history="" canCreate={false} canExport={false} onClose={()=>setOpen(false)}/>}</>
  }
  render(<Fixture/>)
  const trigger=button('设置入口');trigger.focus();fireEvent.click(trigger)
  expect(button('模型服务').disabled).toBe(true);expect(button('云电脑').disabled).toBe(true);expect(button('新对话').disabled).toBe(true)
  expect(screen.getByRole('radio',{name:'阅读模式'}).closest('fieldset')?.disabled).toBe(true)
  expect(screen.queryByText('本机 0 条记录')).toBeNull();expect(screen.getByText('员工服务未就绪')).toBeTruthy()
  fireEvent.click(button('关闭聊天设置'))
  await act(async()=>{})
  expect(document.activeElement).toBe(trigger)
})
