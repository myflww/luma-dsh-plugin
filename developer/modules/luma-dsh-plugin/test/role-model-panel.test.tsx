import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentServicePanel } from '../src/client/RoleModelPanel.tsx'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})

it('preserves the save receipt when the freshly saved custom endpoint refreshes its catalog',async()=>{
  vi.stubGlobal('fetch',async(url:string)=>{
    const value=url.endsWith('/providers') ? {providers:[]} : url.endsWith('/discover') ? {models:[{id:'fixture-model',name:'fixture-model'}]} : {}
    return Response.json({ok:true,value})
  })
  const props={roleId:'shan' as const,name:'山',canWrite:true,refresh:async()=>true,close:()=>{}}
  const panel=render(<AgentServicePanel {...props}/>)
  fireEvent.change(screen.getByLabelText('模型来源'),{target:{value:'custom'}})
  const baseUrl='http://127.0.0.1:4321/v1'
  fireEvent.change(screen.getByLabelText('服务地址'),{target:{value:baseUrl}})
  fireEvent.change(screen.getByLabelText('模型标识'),{target:{value:'fixture-model'}})
  fireEvent.click(screen.getByRole('button',{name:'保存服务'}))
  await screen.findByText('已保存山的模型设置。')
  panel.rerender(<AgentServicePanel {...props} config={{source:'custom',protocol:'openai',provider:'',model:'fixture-model',baseUrl,effort:'',hasKey:false}}/>)
  await screen.findByRole('option',{name:'fixture-model'})
  expect(screen.getByText('已保存山的模型设置。')).toBeTruthy()
})

it('reads the configured DSH catalog, saves model-specific reasoning and permits a manual custom ID after discovery fails',async()=>{
  const saves:Record<string,unknown>[]=[]
  const requests:string[]=[]
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    const action=url.split('/').at(-1)!, body=JSON.parse(String(init.body))
    requests.push(action)
    let value:unknown={}
    if(action==='providers') value={providers:[{id:'shared',name:'我的 DSH 服务'}]}
    if(action==='models') value={models:[{id:'lite',name:'快速'},{id:'writer',name:'写作'}]}
    if(action==='reasoning') value={efforts:body.model==='writer'?[{id:'thoughtful',name:'仔细推敲'}]:[],defaultEffort:undefined}
    if(action==='discover') return Response.json({ok:false,error:'这个服务没有模型列表。'},{status:404})
    if(action==='configure') saves.push(body)
    return Response.json({ok:true,value})
  })
  render(<AgentServicePanel roleId="shan" name="山" canWrite refresh={async()=>true} close={()=>{}}/>)
  await screen.findByRole('option',{name:'我的 DSH 服务 · shared'})
  const select=await screen.findByLabelText('可用模型')
  fireEvent.change(select,{target:{value:'writer'}})
  await screen.findByRole('option',{name:'仔细推敲'})
  fireEvent.change(screen.getByLabelText('思考强度'),{target:{value:'thoughtful'}})
  fireEvent.click(screen.getByRole('button',{name:'保存服务'}))
  await waitFor(()=>expect(saves[0]).toEqual({roleId:'shan',source:'dsh',provider:'shared',model:'writer',effort:'thoughtful'}))
  fireEvent.change(screen.getByLabelText('模型来源'),{target:{value:'custom'}})
  fireEvent.change(screen.getByLabelText('服务地址'),{target:{value:'http://localhost:1234/v1'}})
  fireEvent.change(screen.getByLabelText('API 密钥'),{target:{value:'fixture'}})
  fireEvent.click(screen.getByRole('button',{name:'读取端点模型'}))
  await screen.findByText('这个服务没有模型列表。')
  fireEvent.change(screen.getByLabelText('模型标识'),{target:{value:'local-alias'}})
  fireEvent.change(screen.getByLabelText('思考强度'),{target:{value:'high'}})
  fireEvent.click(screen.getByRole('button',{name:'保存服务'}))
  await waitFor(()=>expect(saves[1]).toEqual({roleId:'shan',source:'custom',model:'local-alias',effort:'high',protocol:'openai',baseUrl:'http://localhost:1234/v1',apiKey:'fixture'}))
  expect(requests.filter(r=>r==='discover')).toHaveLength(1)
})
