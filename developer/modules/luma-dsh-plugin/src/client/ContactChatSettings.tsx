import { useId, type ReactNode } from 'react'
import { BookOpen, BookUser, ChevronDown, ChevronRight, Cloud, Download, ExternalLink, History, MessageCircle, MessagesSquare, Plus, SlidersHorizontal, UserRoundPen, X, type LucideIcon } from 'lucide-react'
import { ProviderMark } from './ProviderMark.tsx'
import type { AgentConfig } from './agent-desk-api.ts'
import { EmployeeFace } from './AgentDeskPanels.tsx'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'
import type { MessagesSnapshot } from './messages-runtime.ts'
import { useDrawerFocus } from './use-drawer-focus.ts'
import './ContactChatSettings.css'

type Section = 'api' | 'persona' | 'memory'
type Props = {
  state:MessagesSnapshot; model?:string | undefined; config?:AgentConfig | undefined; deskReady:boolean; memoryCount?:number | undefined
  history:string; historyOptions:ReactNode; historyBusy:boolean; canCreate:boolean; canExport:boolean
  onSection:(section:Section)=>void; onClose:()=>void; onHistory:(value:string)=>void; onCreate:()=>void
  onDisplay:(value:'bubbles'|'novel')=>void; onExport:()=>void; onNative:()=>void
  onRecords?():void
}

function ToolContent({Icon,title,subtitle,descriptionId}:{Icon:LucideIcon;title:string;subtitle:string;descriptionId?:string}) {
  return <><span className="lumaChatToolIcon"><Icon size={17} aria-hidden="true"/></span>
    <span className="lumaChatToolText"><strong>{title}</strong><small id={descriptionId} title={subtitle}>{subtitle}</small></span></>
}

export function ContactChatSettings({state,model,config,deskReady,memoryCount,history,historyOptions,historyBusy,canCreate,canExport,
  onSection,onClose,onHistory,onCreate,onDisplay,onExport,onNative,onRecords}:Props) {
  const {roleId,profile,preferences}=state
  const uid=useId()
  const panel=useDrawerFocus<HTMLElement>()
  const tools:{id:Section;title:string;subtitle:string;Icon:LucideIcon}[]=[
    {id:'persona',title:'人格设定',subtitle:preferences.profiles[roleId]?'已自定义':'作者设定',Icon:UserRoundPen},
    {id:'memory',title:'记忆库',subtitle:typeof memoryCount==='number'?'本机 '+memoryCount+' 条记录':'查看角色记忆',Icon:BookUser}
  ]
  return <aside ref={panel} className="lumaChatSettings" aria-label="聊天设置">
    <header className="lumaChatSettingsHeader"><span><SlidersHorizontal size={17} aria-hidden="true"/><h2>聊天设置</h2></span>
      <button type="button" data-drawer-focus aria-label="关闭聊天设置" onClick={onClose}><X size={17}/></button></header>
    <div className="lumaChatSettingsBody">
      <section className="lumaChatRole" aria-labelledby={uid+'-role'}>
        <div className="lumaChatIdentity"><EmployeeFace id={roleId} skin={state.employeeSkins?.[roleId]}/>
          <div><h3 id={uid+'-role'}>{profile.name}</h3><p>{!history?'会话服务待选择':history.startsWith('native:')?'DSH 原生会话':'角色独立会话'}</p></div></div>
        <div className="lumaChatRoleTools"><button type="button" className="lumaChatBinding" aria-label="模型服务" aria-describedby={uid+'-model'} disabled={!deskReady} onClick={()=>onSection('api')}>
          <ProviderMark config={config} size={33}/><span className="lumaChatToolText"><strong>模型服务</strong><small id={uid+'-model'}>{!deskReady?'员工服务未就绪':config?.model || model || '未绑定独立模型'}</small></span><ChevronRight size={15} aria-hidden="true"/></button>
          {tools.map(({id,title,subtitle,Icon})=><button key={id} type="button" data-tool={id}
          aria-label={title} aria-describedby={uid+'-'+id} onClick={()=>onSection(id)}>
          <ToolContent Icon={Icon} title={title} subtitle={subtitle} descriptionId={uid+'-'+id}/></button>)}
          <CloudOfficeLauncher roleId={roleId} name={profile.name} disabled={!state.writable} label="云电脑" className="lumaCloudShortcut">
            {connection=><ToolContent Icon={Cloud} title="云电脑" subtitle={connection}/>}</CloudOfficeLauncher></div>
      </section>
      <section className="lumaChatSession" aria-labelledby={uid+'-session'}>
        <div className="lumaChatSectionTitle"><h3 id={uid+'-session'}>会话管理</h3>
          <button type="button" onClick={onCreate} disabled={!canCreate}><Plus size={14} aria-hidden="true"/>新对话</button></div>
        <label className="lumaChatField" htmlFor={uid+'-history'}><History size={15} aria-hidden="true"/>历史对话</label>
        <select id={uid+'-history'} value={history} disabled={historyBusy} onChange={e=>onHistory(e.target.value)}>{historyOptions}</select>
        {onRecords && <button type="button" className="lumaChatRecordLink" onClick={onRecords}><History size={15} aria-hidden="true"/>记录管理<ChevronRight size={14} aria-hidden="true"/></button>}
        <fieldset className="lumaChatDisplay" disabled={!state.writable || state.pending}><legend>消息显示</legend>
          <div>{([{id:'bubbles',title:'气泡模式',Icon:MessagesSquare},{id:'novel',title:'阅读模式',Icon:BookOpen}] as const).map(({id,title,Icon})=>
            <label key={id}><input type="radio" name={uid+'-display'} value={id} checked={preferences.display===id} onChange={()=>onDisplay(id)}/>
              <span><Icon size={15} aria-hidden="true"/>{title}</span></label>)}</div></fieldset>
      </section>
      <details className="lumaChatMore"><summary>更多会话工具<ChevronDown size={15} aria-hidden="true"/></summary>
        <div><button type="button" disabled={!canExport} onClick={onExport}><Download size={15} aria-hidden="true"/>导出对话</button>
          <button type="button" onClick={onNative}><MessageCircle size={15} aria-hidden="true"/>原生会话与模型设置<ExternalLink size={13} aria-hidden="true"/></button></div></details>
    </div>
  </aside>
}
