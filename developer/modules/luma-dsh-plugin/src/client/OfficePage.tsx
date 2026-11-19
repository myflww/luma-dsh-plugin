import { useEffect, useState } from 'react'
import { OfficeSceneSurface } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSurface.tsx'
import { createOfficeTimePolicy, formatOfficeClock } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import type { OfficeAssetId } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeExperience.css'
import type { OfficePageRuntime } from './office-runtime.ts'
import { OFFICE_OUTFIT_CHOICES, OFFICE_THEME_CHOICES } from './office-theme-catalog.ts'
import { DEFAULT_OFFICE_PRESENCE } from '../office-presentation-settings.ts'
import { withOfficePresence } from './office-presence.ts'
import { OfficeBedroom, type ResidentId } from './OfficeBedroom.tsx'
import { OfficeWardrobe } from './OfficeWardrobe.tsx'
import { projectPluginSceneEmployees } from './office-scene-employees.ts'
import { useAgentWorkRoles } from './agent-work-activity.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import officeEmblem from '../../art/office-navigation/office.webp'
import bedroomEmblem from '../../art/office-navigation/bedroom.webp'
import rosterEmblem from '../../art/office-navigation/roster.webp'
import wardrobeEmblem from '../../art/office-navigation/wardrobe.webp'
import { Maximize2, Minimize2 } from 'lucide-react'
import './OfficePage.css'

export interface OfficePageProps {
  readonly runtime: OfficePageRuntime
  readonly onOpenChat: (employeeId: string, intent?: 'task') => void
  /** The shell keeps this page mounted so a native workspace selection retains its employee. */
  readonly active?: boolean
}

// Historical whole.v2 bytes remain lost. Newly authored plugin-r1 stills have
// separate IDs and source pins; the old records are never represented as recovered.
const unavailableHistoricalRestArt: readonly OfficeAssetId[] = ['employee.lu-mi.rest.left.whole.v2', 'employee.lu-mi.rest.right.whole.v2']

export function OfficePage({ runtime, onOpenChat, active = true }: OfficePageProps) {
  const [snapshot, setSnapshot] = useState(() => runtime.getSnapshot())
  const [scene,setScene] = useState<'office'|'bedroom'>('office')
  const [panel,setPanel] = useState<'roster'|'wardrobe'|null>(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded || !active) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [expanded, active])
  const [resident,setResident] = useState<ResidentId>('shan')
  const workRoles = useAgentWorkRoles(active)
  const [now, setNow] = useState(() => new Date())
  const [reduceMotion, setReduceMotion] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    setSnapshot(runtime.getSnapshot())
    return runtime.subscribe(() => setSnapshot(runtime.getSnapshot()))
  }, [runtime])
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout>
    const update = () => { clearTimeout(timer); setNow(new Date()); timer = setTimeout(update, 60_000 - Date.now() % 60_000) }
    update()
    document.addEventListener('visibilitychange', update)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', update) }
  }, [active])
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const policy = createOfficeTimePolicy({ date: now,
    ...(snapshot.calendar ? { calendar: snapshot.calendar } : {}),
    ...(snapshot.holidayCalendar ? { officialCalendarCache: snapshot.holidayCalendar } : {}),
  })
  const presentation = snapshot.presentation
  const selection = presentation.selection
  const presence = selection.presence ?? DEFAULT_OFFICE_PRESENCE
  const scenePolicy = withOfficePresence(policy, presence)
  const presentationDisabled = !presentation.canEdit || presentation.saving
  const employees = projectPluginSceneEmployees(snapshot.projection.employees, workRoles, policy, now)
  const selectedEmployee = employees.find(employee=>employee.id === resident)
  const owner = OFFICE_OUTFIT_CHOICES.find(choice=>choice.employeeId === resident)!
  const visit = (id:ResidentId) => { setResident(id); setPanel(null); setScene('bedroom') }
  const dress = (id:ResidentId) => { setResident(id); setPanel('wardrobe') }
  const themeTitle = OFFICE_THEME_CHOICES.find(theme => theme.id === (selection.officeTheme ?? null))?.name ?? '办公室'
  const shift = !policy.isWorkingDate ? '休息日' : policy.isWorkPeriod ? '上班中' : policy.attendancePeriod === 'lunch' ? '午休中' : policy.hour < 9 ? '上班前' : '已下班'
  return <section className="lumaDshOffice lumaStudio" aria-label="Luma 办公室">
    <header className="lumaDshOfficeHeader">
      <h1>{scene==='office'?themeTitle:owner.name+'的卧室'}</h1>
      <div className="lumaOfficeClock"><span>{shift}</span><time dateTime={now.toISOString()}>{formatOfficeClock(now)}</time></div>
    </header>
    {(presentation.saving || presentation.message) && <p className="lumaDshOfficeNotice" role="status">{presentation.saving ? '正在保存办公室设置…' : presentation.message}</p>}
    {snapshot.problem && <p className="lumaDshOfficeNotice" role="alert">{snapshot.problem}</p>}
    {snapshot.persistence !== 'host' && <p className="lumaDshOfficeNotice" role="status">{snapshot.persistence === 'loading' ? '正在读取工位记录…' : snapshot.persistence === 'memory' ? '当前工位与角色会话绑定仅在本次连接中保留。' : '工位设置暂不可用，聊天记录仍由 DSH 保存。'}</p>}
    <div className="lumaStudioLayout">
      <div className={'lumaStudioCanvas'+(expanded?' is-expanded':'')}>
        {scene==='office' ? <div className="lumaDshOfficeRoom">
      <OfficeSceneSurface employees={employees} reports={snapshot.projection.officeReportMarkers}
        commands={snapshot.commands} timePolicy={scenePolicy} presentationActive={active} reduceMotion={reduceMotion || snapshot.motionPreference === 'reduce'}
        unavailableAssetIds={unavailableHistoricalRestArt}
        {...selection.officeTheme ? { officeTheme: selection.officeTheme } : {}}
        employeeSkins={selection.employeeSkins}
        employeeDestination="workbench" onCharacterClick={onOpenChat}
        onBindWorkstation={(employeeId, workstationId) => runtime.bindWorkstation(employeeId, workstationId)}
        onSceneEvent={event => runtime.handleSceneEvent(event)}
        onReportClick={reportId => { void runtime.openReport(reportId).then(employeeId => { if (employeeId) onOpenChat(employeeId) }) }} />
        </div> : (
      <OfficeBedroom hasInspector key={resident} id={resident} name={owner.name} skinId={selection.employeeSkins[resident]}
        phase={policy.phase} bedtime={policy.bedtime === true} working={selectedEmployee?.sceneActivity==='working'}
        onChat={()=>onOpenChat(resident)} onOffice={()=>setScene('office')} onWardrobe={()=>dress(resident)} />
        )}
        {scene==='office' && <div className="lumaRoomCaption">
          <p>点选员工进入工作台<span> · 长按空闲员工调整工位</span></p>
        </div>}
          <button className="lumaCanvasZoom" type="button" aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}>
            {expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>} {expanded?'还原场景':'放大场景'}
          </button>
      </div>
      <aside className="lumaStudioInspector" aria-label="场景控制台">
        <section className="lumaStudioSection">
          <h2>空间导览</h2>
          <nav className="lumaOfficeTools lumaSpaceDestinations" aria-label="办公室设施">
            <button type="button" aria-label={scene==='bedroom'?'返回办公室':'办公室'} aria-pressed={scene==='office'} onClick={()=>{setScene('office');setPanel(null)}}><img src={officeEmblem} alt=""/>办公室</button>
            <button type="button" aria-pressed={scene==='bedroom'} onClick={()=>visit(resident)}><img src={bedroomEmblem} alt=""/>伙伴卧室</button>
          </nav>
        </section>
        <section className="lumaStudioSection">
          <h2>{scene==='office'?'场景设置':'房间与任务'}</h2>
          {scene==='office' ? (
      <div className="lumaDshOfficeAppearance">
        <label className="lumaDshOfficeThemeLabel">办公室主题
          <select aria-label="办公室主题" value={selection.officeTheme ?? ''} disabled={presentationDisabled}
            onChange={event => { void runtime.setTheme(event.target.value || null) }}>
            {OFFICE_THEME_CHOICES.map(theme => <option key={theme.id ?? 'classic'} value={theme.id ?? ''}>{theme.name}</option>)}
          </select>
        </label>
        <label className="lumaDshOfficeThemeLabel">场景成员
          <select aria-label="场景成员" value={presence} disabled={presentationDisabled}
            onChange={event => { void runtime.setPresence(event.target.value) }}>
            <option value="all">显示所有角色</option><option value="schedule">跟随作息</option>
          </select>
        </label>
      </div>
          ) : (
      <div className="lumaDshOfficeAppearance lumaBedroomToolbar"><label className="lumaDshOfficeThemeLabel">选择房间
        <select aria-label="选择房间" value={resident} onChange={e=>visit(e.target.value as ResidentId)}>
          {OFFICE_OUTFIT_CHOICES.map(choice=><option key={choice.employeeId} value={choice.employeeId}>{choice.name}的卧室</option>)}
        </select></label>
        <button type="button" onClick={()=>onOpenChat(resident, 'task')}>给{owner.name}派任务</button>
      </div>
          )}
        </section>
        <section className="lumaStudioSection lumaStudioPeople">
          <h2>员工管理</h2>
          <div className="lumaOfficeTools lumaStudioActions">
            <button type="button" aria-expanded={panel==='roster'} onClick={()=>setPanel(panel==='roster'?null:'roster')}><img src={rosterEmblem} alt=""/>员工列表</button>
            <button type="button" aria-expanded={panel==='wardrobe'} onClick={()=>setPanel(panel==='wardrobe'?null:'wardrobe')}><img src={wardrobeEmblem} alt=""/>换装</button>
          </div>
        </section>
    {panel==='roster' && <section className="lumaOfficePanel" aria-label="AI 员工列表">
      <div className="lumaOfficePanelTitle"><h2>AI 员工</h2><span>{employees.length} 位已加入</span>
        <button type="button" onClick={()=>setPanel(null)}>收起列表</button></div>
      <ul className="lumaOfficeTeamGrid">{employees.map(employee=>{
        const id=employee.id as ResidentId
        if (!OFFICE_OUTFIT_CHOICES.some(choice=>choice.employeeId===id)) return null
        return <li key={id}>
          <MessageAvatar {...getChibiAvatar(id,selection.employeeSkins[id])}/>
          <div><strong>{employee.name}</strong><small>{employee.activity}</small></div>
          <div className="lumaOfficeMemberActions">
            <button type="button" onClick={()=>visit(id)} aria-label={'进入'+employee.name+'的卧室'}>卧室</button>
            <button type="button" onClick={()=>dress(id)} aria-label={employee.name+'换装'}>换装</button>
            <button type="button" onClick={()=>onOpenChat(id)} aria-label={'打开'+employee.name+'的工作台'}>工作台</button>
          </div>
        </li>})}</ul>
    </section>}
    {panel==='wardrobe' && <OfficeWardrobe id={resident} selected={selection.employeeSkins[resident]}
      disabled={presentationDisabled} onSelect={setResident} onEquip={skin=>void runtime.setOutfit(resident,skin)} onClose={()=>setPanel(null)}/>}
      </aside>
    </div>
  </section>
}
