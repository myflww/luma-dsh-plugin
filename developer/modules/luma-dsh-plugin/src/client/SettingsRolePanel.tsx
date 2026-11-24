import { useState, useSyncExternalStore } from 'react'
import { ArrowUpRight, MessageCircle, Pencil } from 'lucide-react'
import { useAgentDesk } from './agent-desk-api.ts'
import { EmployeeFace } from './AgentDeskPanels.tsx'
import { MESSAGE_CHARACTERS, type MessagesRuntime } from './messages-runtime.ts'
import { AgentServicePanel } from './RoleModelPanel.tsx'
import { RolePortraitPanel } from './RolePortraitPanel.tsx'
import { LocalHarnessPanel } from './LocalHarnessPanel.tsx'
import { ProviderMark } from './ProviderMark.tsx'

export interface SettingsRoster {
  messages: MessagesRuntime
  unlocked: readonly string[]
  openContact(id: string): void
  editPersona?(id:string):void
}

function ModelBinding({ roleId, name, writable, localOnly = false }: {roleId: string; name: string; writable: boolean; localOnly?: boolean}) {
  const desk = useAgentDesk(true)
  const [editing, setEditing] = useState(false)
  const config = desk.state?.roles[roleId]
  if(localOnly && desk.state) return <LocalHarnessPanel roleId={roleId} name={name} canWrite={writable} config={config} refresh={desk.refresh}/>
  return <section aria-label="角色的模型服务">
    <div className="lumaSettingsSplit"><h2>模型服务</h2>{desk.state && !editing && <button type="button" disabled={!writable} onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true"/>配置角色模型</button>}</div>
    {desk.problem && <p role="alert">{desk.problem} <button onClick={() => void desk.refresh()}>重新读取</button></p>}
    {desk.state ? <>
      <div className="lumaCurrentBinding"><ProviderMark config={config} kind={config?.model?undefined:'dsh'} size={34}/><div>
        <strong>{config?.model || '跟随 DSH 会话'}</strong>{config?.model && <small>{config.source==='local'?'本机订阅':config.source==='dsh'?'DSH 服务':config.baseUrl || '自定义 API'}</small>}
      </div></div>
      {editing ? <AgentServicePanel roleId={roleId} name={name} config={config} canWrite={writable} refresh={desk.refresh}
        close={() => setEditing(false)} onSaved={() => setEditing(false)}/> : null}
    </> : !desk.problem && <p role="status">正在读取模型设置…</p>}
  </section>
}

function PersonalityText({value}:{value:string}) {
  const [expanded,setExpanded]=useState(false)
  const characters=Array.from(value)
  const long=characters.length>150
  return <><p className="lumaSettingsPersonality">{long && !expanded?characters.slice(0,150).join('').trimEnd()+'…':value}</p>
    {long && <button type="button" className="lumaSettingsTextAction" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起全文':'展开完整设定'}</button>}</>
}

export function SettingsRolePanel({ roster, page, writable }: {roster: SettingsRoster; page: 'memory'|'roles'|'local'; writable: boolean}) {
  const snapshot = useSyncExternalStore(roster.messages.subscribe, roster.messages.getSnapshot, roster.messages.getSnapshot)
  const roles = MESSAGE_CHARACTERS.filter(role => roster.unlocked.includes(role.id))
  const [selected, setSelected] = useState(snapshot.roleId)
  const role = roles.find(row => row.id === selected) ?? roles[0]
  if (!role) return <p role="status">邀请伙伴后，可在这里管理该角色。</p>
  const profile = snapshot.preferences.profiles[role.id] ?? role.profile
  return <>
    <section className="lumaSettingsIdentity" aria-label="角色选择">
      <EmployeeFace id={role.id} skin={snapshot.employeeSkins?.[role.id]}/>
      <label>当前角色<select aria-label="当前角色" value={role.id} onChange={event => setSelected(event.target.value)}>
        {roles.map(item => <option key={item.id} value={item.id}>{snapshot.preferences.profiles[item.id]?.name ?? item.name}</option>)}
      </select></label>
      <button type="button" onClick={() => roster.openContact(role.id)}><MessageCircle size={14} aria-hidden="true"/>打开私聊</button>
    </section>
    {page==='memory' ? <RolePortraitPanel key={role.id} roleId={role.id} name={profile.name} canWrite={writable}/> :
      <ModelBinding key={role.id+page} roleId={role.id} name={profile.name} writable={writable} localOnly={page==='local'}/>}
    {page==='roles' && <section aria-label="角色人格"><div className="lumaSettingsSplit"><div><h2>角色人格</h2>
      <small className="lumaSettingsHint">{snapshot.preferences.profiles[role.id]?'已自定义':'作者设定'}</small></div>
      {roster.editPersona && <button type="button" disabled={!writable || snapshot.pending} onClick={()=>roster.editPersona?.(role.id)}>编辑人格<ArrowUpRight size={14} aria-hidden="true"/></button>}</div>
      <PersonalityText key={role.id} value={profile.personality}/>
      {!roster.editPersona && <p className="lumaSettingsHint">可在该角色私聊的「人格设定」中编辑。</p>}</section>}
  </>
}
