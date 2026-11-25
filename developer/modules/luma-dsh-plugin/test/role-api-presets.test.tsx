import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {AgentServicePanel} from '../src/client/RoleModelPanel.tsx'

afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('sets the selected service URL and clears the previous endpoint’s unsaved key and model',async()=>{
  const calls:{baseUrl:string;apiKey?:string;protocol:string}[]=[]
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    if(url.endsWith('/discover')) calls.push(JSON.parse(String(init.body)))
    return Response.json({ok:true,value:{providers:[],models:[]}})
  })
  render(<AgentServicePanel roleId="shan" name="山" canWrite refresh={async()=>true} close={()=>{}}/>)
  fireEvent.click(screen.getByRole('radio',{name:'自定义 API'}))
  const picker=screen.getByLabelText('服务协议')
  fireEvent.change(picker,{target:{value:'https://api.moonshot.cn/v1'}})
  expect(screen.getByLabelText<HTMLInputElement>('服务地址').value).toBe('https://api.moonshot.cn/v1')
  fireEvent.change(screen.getByLabelText('API 密钥'),{target:{value:'old-fixture-key'}})
  fireEvent.change(screen.getByLabelText('模型标识'),{target:{value:'fixture-model'}})
  fireEvent.change(picker,{target:{value:'https://dashscope.aliyuncs.com/compatible-mode/v1'}})
  expect(screen.getByLabelText<HTMLInputElement>('API 密钥').value).toBe('')
  expect(screen.getByLabelText<HTMLInputElement>('模型标识').value).toBe('')
  fireEvent.click(screen.getByRole('button',{name:'读取端点模型'}))
  await waitFor(()=>expect(calls).toHaveLength(1))
  expect(calls[0]).toMatchObject({protocol:'openai',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1'})
  expect(calls[0]).not.toHaveProperty('apiKey')
})
