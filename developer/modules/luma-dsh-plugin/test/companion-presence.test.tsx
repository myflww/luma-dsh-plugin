import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { afterEach, it, expect, vi } from 'vitest'
import { CompanionPresence, CompanionSettingsPanel } from '../src/client/CompanionPresence.tsx'
import { AgentMemoryPanel } from '../src/client/AgentDeskPanels.tsx'
import { RolePortraitPanel } from '../src/client/RolePortraitPanel.tsx'
import { agentRequest } from '../src/client/agent-desk-api.ts'
import { defaultCompanionSettings } from '../src/shared/companion-life.ts'
vi.mock('../src/client/agent-desk-api.ts',()=>({agentRequest:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const messages={getSnapshot:()=>({writable:true, roleId:'jingyuniang',preferences:{profiles:{},activeTopics:{}}})}
const office={getSnapshot:()=>({persistence:'host',projection:{employees:[]},motionPreference:'reduce'})}

it('opens the same employee from a floating letter and limits model-written private content to their conversation',async()=>{
  const reply={danmaku:true,letter:{id:'l',role:'jingyuniang',source:'model',topic:'native:abc',time:1,text:'Private topic'}}
  vi.mocked(agentRequest).mockResolvedValue(reply)
  const open=vi.fn()
  render(<CompanionPresence messages={messages as never} office={office as never} sceneVisible onContact={open}/>)
  const button=await screen.findByRole('button',{name:'打开鲸鱼娘的主动来信'})
  expect(button.textContent).not.toContain(reply.letter.text)
  expect(button.parentElement?.className).toContain('is-reduced')
  fireEvent.click(button)
  expect(open).toHaveBeenCalledWith('jingyuniang')
  expect(screen.queryByRole('button')).toBeNull()
})
it('allows choosing the recipient only after local foreground preview has been enabled',async()=>{
  let settings={...defaultCompanionSettings}
  vi.mocked(agentRequest).mockImplementation(async(action,params)=>{
    if(action==='companionconfigure')settings={...settings,...params}
    return {roles:['jingyuniang'],settings,sampler:settings.collectApps?'ready':'off',apps:settings.collectApps?[{app:'Example Editor',seconds:85}]:[]}
  })
  render(<CompanionSettingsPanel/>)
  await screen.findByText('允许伙伴主动来信')
  fireEvent.click(screen.getByText('屏幕使用情况'))
  const opt=await screen.findByLabelText('开启本机应用时长预览')
  expect((opt as HTMLInputElement).checked).toBe(false)
  expect(screen.queryByLabelText('鲸鱼娘')).toBeNull()
  fireEvent.click(opt)
  await screen.findByText('Example Editor')
  expect(screen.getByText('1 分 25 秒')).toBeTruthy()
  fireEvent.click(screen.getByLabelText('鲸鱼娘'))
  await waitFor(()=>expect(settings.sharedRoles).toEqual(['jingyuniang']))
})


it('shows which employee learned a preference and withdraws only the matching current value',async()=>{
  const item={key:'address',label:'称呼',value:'称呼我为「阿澜」'}
  vi.mocked(agentRequest).mockImplementation(async(action)=>action==='memory' ? {entries:[],styles:[item]} : {styles:[]})
  render(<AgentMemoryPanel roleId="jingyuniang" name="鲸鱼娘" canWrite count={1} refresh={async()=>{}} close={()=>{}} house={undefined}/>)
  expect(await screen.findByText(item.value)).toBeTruthy()
  expect(await screen.findByText(/当前员工服务未提供有效的角色画像/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'撤回称呼'}))
  await screen.findByText('已撤回这条相处习惯，原对话可继续查看。')
  expect(screen.queryByText(item.value)).toBeNull()
  expect(agentRequest).toHaveBeenCalledWith('forgetstyle',{roleId:'jingyuniang',key:'address',value:item.value},expect.anything())
})

it('edits a dated portrait, confirms removal and sends the matching role and current revision',async()=>{
  const roleId='jingyuniang'
  const item={id:'row1',scope:'private',text:'我的默认格式是蓝纸。',evidence:'我的默认格式是蓝纸。',kind:'stated',source:'work',revision:1,updatedAt:Date.now(),count:1}
  let data={automatic:true,modelReview:false,modelAvailable:false,scopeNames:{},items:[item]}
  vi.mocked(agentRequest).mockImplementation(async(action,body)=>{
    if(action==='portraitedit') {
      expect(body).toEqual({roleId,id:'row1',text:'我的默认格式是白纸。',revision:1})
      data={...data,items:[{...item,text:'我的默认格式是白纸。',kind:'corrected',evidence:'',revision:2}]}
    } else if(action==='portraitforget') {
      expect(body).toEqual({roleId,id:'row1',revision:2})
      data={...data,items:[]}
    }
    return data
  })
  render(<RolePortraitPanel roleId={roleId} name="鲸鱼娘" canWrite/>)
  await screen.findByText(item.text)
  fireEvent.click(screen.getByRole('button',{name:'更正'}))
  fireEvent.change(screen.getByRole('textbox',{name:'更正内容'}),{target:{value:'我的默认格式是白纸。'}})
  fireEvent.click(screen.getByRole('button',{name:'保存更正'}))
  await screen.findByText('我的默认格式是白纸。')
  fireEvent.click(screen.getByRole('button',{name:'移除'}))
  expect(screen.getByText('我的默认格式是白纸。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'确认移除'}))
  await screen.findByText('已从画像移除。')
  expect(screen.queryByText('我的默认格式是白纸。')).toBeNull()
})
