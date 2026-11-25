import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CloudOfficeConnection } from '../src/client/CloudOfficePanel.tsx'
import { RolePortraitPanel } from '../src/client/RolePortraitPanel.tsx'
import { LoveHouseQuickConnect } from '../src/client/LoveHouseQuickConnect.tsx'
import { PluginSettingsPage } from '../src/client/PluginSettingsPage.tsx'

afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const button=(name:string)=>screen.getByRole<HTMLButtonElement>('button',{name,exact:true})
const response=(value:unknown)=>Response.json({ok:true,value})

it('reads a saved worker, tests its current address, and discards a typed credential when the server changes',async()=>{
  let attempts=0
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/cloudstate') && attempts++===0)throw Error('暂时离线')
    if(url.endsWith('/cloudprobe'))return response({kinds:['document']})
    return response({url:'https://cloud.test',hasToken:true,jobs:[]})
  }))
  render(<CloudOfficeConnection/>)
  await screen.findByText(/暂时离线/)
  fireEvent.click(button('重新读取云设置'))
  await screen.findByText('已保存工作器地址')
  fireEvent.click(button('测试连接'));await screen.findByText('本次连接测试通过')
  const token=screen.getByLabelText('连接令牌') as HTMLInputElement
  fireEvent.change(token,{target:{value:'synthetic-test-token'}})
  expect(button('测试连接').disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('工作器地址'),{target:{value:'https://other.test'}})
  expect(token.value).toBe('');expect(token.placeholder).toBe('工作器启动时设置的令牌')
  expect(screen.queryByText('本次连接测试通过')).toBeNull()
})

it('filters portraits by personal or studio scope and searches a recorded source quote',async()=>{
  const item={revision:1,updatedAt:1234,kind:'stated',source:'work',count:1}
  vi.stubGlobal('fetch',vi.fn(async()=>response({automatic:true,modelAvailable:false,modelReview:false,scopeNames:{room:'校样组'},
    items:[{...item,id:'a',text:'总用蓝纸',evidence:'旧样张要用海蓝纸',scope:'private'},{...item,id:'b',text:'交付索引',evidence:'校刊要有索引',scope:'room'}]})))
  render(<RolePortraitPanel roleId="shan" name="珊" canWrite/>)
  await screen.findByText('总用蓝纸')
  fireEvent.change(screen.getByRole('searchbox',{name:'搜索画像条目'}),{target:{value:'海蓝'}})
  expect(screen.queryByText('交付索引')).toBeNull()
  fireEvent.change(screen.getByRole('combobox',{name:'画像范围'}),{target:{value:'room'}})
  expect(screen.queryByText('总用蓝纸')).toBeNull()
  fireEvent.click(button('清除筛选'));expect(screen.getByText('交付索引')).toBeTruthy()
  fireEvent.click(screen.getByText('整理方式'));expect(screen.getByRole('checkbox',{name:'自动整理用户画像'})).toBeTruthy()
})

it('refreshes offline Love House status without creating a connection',async()=>{
  const calls:string[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(url);return response({status:calls.length===1?'offline':'unverified',bound:1,verified:0,total:2,pending:3})}))
  render(<LoveHouseQuickConnect writable={false}/>)
  await screen.findByText('离线')
  expect(button('连接爱之屋').disabled).toBe(true)
  fireEvent.click(button('刷新状态'));await screen.findByText('服务待核对')
  expect(calls.every(url=>url.endsWith('/housestatus'))).toBe(true)
  expect(screen.getByText('1 / 2')).toBeTruthy()
})

it('searches multiple terms, lands keyboard focus on the resulting category and clears an empty search',async()=>{
  const snapshot={writable:true,pending:false,preferences:{reducedMotion:'system'}}
  const api={getSnapshot:()=>snapshot,subscribe:()=>()=>{}}
  vi.stubGlobal('fetch',vi.fn(async()=>response({})))
  render(<PluginSettingsPage runtime={api as never}/>)
  const box=screen.getByRole('searchbox',{name:'搜索设置分类'})
  fireEvent.change(box,{target:{value:'记忆 画像'}});fireEvent.keyDown(box,{key:'Enter'})
  const heading=await screen.findByRole('heading',{name:'角色记忆',exact:true})
  expect(document.activeElement).toBe(heading)
  fireEvent.change(box,{target:{value:'没有这个词'}})
  fireEvent.click(button('清除搜索'));expect(document.activeElement).toBe(box)
  expect(button('通用')).toBeTruthy()
})
