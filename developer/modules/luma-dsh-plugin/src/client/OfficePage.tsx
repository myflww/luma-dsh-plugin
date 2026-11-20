import { useEffect, useState } from 'react'
import { OfficeSceneSurface } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSurface.tsx'
import { createOfficeTimePolicy, formatOfficeClock } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import type { OfficeAssetId } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeExperience.css'
import type { OfficePageRuntime } from './office-runtime.ts'
import { OFFICE_OUTFIT_CHOICES, OFFICE_THEME_CHOICES } from './office-theme-catalog.ts'
import { STARTER_BEDROOMS, type OfficePresentationSelection } from '../office-presentation-settings.ts'
import { COMPANION_REWARDS, STARTER_EMPLOYEE_ID } from '../shared/local-collection-domain.ts'
import { withActiveTaskMonitors } from './office-presence.ts'
import { OfficeBedroom, type ResidentId } from './OfficeBedroom.tsx'
import { OfficeWardrobe } from './OfficeWardrobe.tsx'
import { projectPluginSceneEmployees } from './office-scene-employees.ts'
import { useAgentWorkRoles } from './agent-work-activity.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import { BedDouble, Building2, Clock3, Maximize2, Minimize2, Palette, Shirt, UsersRound } from 'lucide-react'
import './OfficePage.css'

export interface OfficePageProps {
  readonly runtime: OfficePageRuntime
  readonly onOpenChat: (employeeId: string, intent?: 'task') => void
  readonly unlockedEmployeeIds?: readonly string[]
  readonly unlockedThemeIds?: readonly string[]
  readonly onOpenRewards?: () => void
  /** The shell keeps this page mounted so a native workspace selection retains its employee. */
  readonly active?: boolean
}

// Historical whole.v2 bytes remain lost. Newly authored plugin-r1 stills have
// separate IDs and source pins; the old records are never represented as recovered.
const unavailableHistoricalRestArt: readonly OfficeAssetId[] = ['employee.lu-mi.rest.left.whole.v2', 'employee.lu-mi.rest.right.whole.v2']

const starterThemes = ['office.jingyuniang.v1','bedroom.jingyuniang.v1'] as const
export function OfficePage({ runtime, onOpenChat, active = true, unlockedEmployeeIds = [STARTER_EMPLOYEE_ID], unlockedThemeIds = starterThemes, onOpenRewards }: OfficePageProps) {
  const [snapshot, setSnapshot] = useState(() => runtime.getSnapshot())
  const [scene,setScene] = useState<'office'|'bedroom'>('office')
  const [panel,setPanel] = useState<'roster'|'wardrobe'|'themes'|null>(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded || !active) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [expanded, active])
  const [chosenResident,setResident] = useState<ResidentId>(STARTER_EMPLOYEE_ID)
  const resident = unlockedEmployeeIds.includes(chosenResident) ? chosenResident : STARTER_EMPLOYEE_ID
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
  const presentationDisabled = !presentation.canEdit || presentation.saving
  const roster = snapshot.projection.employees.filter(employee => unlockedEmployeeIds.includes(employee.employeeId))
  const employees = projectPluginSceneEmployees(roster, workRoles, policy, now, snapshot.persistence === 'host' || snapshot.persistence === 'memory')
  const inOffice = employees.filter(employee => employee.location === 'office')
  const scenePolicy = withActiveTaskMonitors(policy, inOffice.some(employee => employee.availability === 'working'))
  const selectedEmployee = employees.find(employee=>employee.id === resident)
  const owner = OFFICE_OUTFIT_CHOICES.find(choice=>choice.employeeId === resident)!
  const visit = (id:ResidentId) => { setResident(id); setPanel(null); setScene('bedroom') }
  const dress = (id:ResidentId) => { setResident(id); setPanel('wardrobe') }
  const officeTheme = selection.officeTheme && unlockedThemeIds.includes(selection.officeTheme) ? selection.officeTheme : null
  const bedrooms: NonNullable<OfficePresentationSelection['bedroomThemes']> = selection.bedroomThemes ?? STARTER_BEDROOMS
  const equippedBedroom = bedrooms[resident]
  const bedroomTheme = equippedBedroom && unlockedThemeIds.includes(equippedBedroom) ? equippedBedroom : null
  const roomArtOwner = COMPANION_REWARDS.find(reward => reward.bedroom === bedroomTheme)?.id
  const themeTitle = OFFICE_THEME_CHOICES.find(theme => theme.id === officeTheme)?.name ?? '办公室'
  const shift = !policy.isWorkingDate ? '休息日' : policy.isWorkPeriod ? '上班中' : policy.attendancePeriod === 'lunch' ? '午休中' : policy.hour < 9 ? '上班前' : '已下班'
  const officeVisible = scene === 'office'
  const toggle = (next: NonNullable<typeof panel>) => setPanel(current => current === next ? null : next)
  return <section className="lumaDshOffice lumaStudio lumaSpatialOffice" aria-label="Luma 办公室">
    <header className="lumaDshOfficeHeader">
      <nav className="lumaSpaceSwitch" aria-label="空间导览">
        <button type="button" aria-label={officeVisible?'办公室':'返回办公室'} aria-pressed={officeVisible} onClick={()=>{setScene('office');setPanel(null)}}>
          <Building2 size={17} aria-hidden="true"/>办公室
        </button>
        <button type="button" aria-pressed={!officeVisible} onClick={()=>visit(resident)}><BedDouble size={18} aria-hidden="true"/>伙伴卧室</button>
      </nav>
      <div className="lumaOfficeClock"><Clock3 size={15} aria-hidden="true"/><span>{shift}</span><time dateTime={now.toISOString()}>{formatOfficeClock(now)}</time></div>
    </header>
    {(presentation.saving || presentation.message) && <p className="lumaDshOfficeNotice" role="status">{presentation.saving ? '正在保存装扮…' : presentation.message}</p>}
    {snapshot.problem && <p className="lumaDshOfficeNotice" role="alert">{snapshot.problem}</p>}
    {snapshot.persistence !== 'host' && <p className="lumaDshOfficeNotice" role="status">{snapshot.persistence === 'loading' ? '正在同步员工位置…' : snapshot.persistence === 'memory' ? '工位与会话绑定将在本次连接内保留。' : '暂时无法同步员工位置。'}</p>}
    <div className="lumaSpaceToolbar">
      <div className="lumaSpaceHeading"><h1>{officeVisible?themeTitle:owner.name+'的卧室'}</h1>
        {officeVisible ? <span>{inOffice.length} 人在办公室</span> :
          <select aria-label="选择房间" value={resident} onChange={event=>visit(event.target.value as ResidentId)}>
            {OFFICE_OUTFIT_CHOICES.filter(choice=>unlockedEmployeeIds.includes(choice.employeeId)).map(choice=><option key={choice.employeeId} value={choice.employeeId}>{choice.name}的卧室</option>)}
          </select>}
      </div>
      <div className="lumaOfficeTools lumaSpaceTools">
        <button type="button" aria-expanded={panel==='themes'} onClick={()=>toggle('themes')}><Palette size={16} aria-hidden="true"/>换肤</button>
        <button type="button" aria-expanded={panel==='roster'} onClick={()=>toggle('roster')}><UsersRound size={16} aria-hidden="true"/>员工列表</button>
        <button type="button" aria-expanded={panel==='wardrobe'} onClick={()=>toggle('wardrobe')}><Shirt size={16} aria-hidden="true"/>换装</button>
      </div>
    </div>
    {panel==='themes' && <section className="lumaOfficePanel lumaRoomDecor" aria-label="场景换肤">
      {officeVisible ? <label>办公室主题
        <select aria-label="办公室主题" value={officeTheme ?? ''} disabled={presentationDisabled}
          onChange={event=>{ const theme=event.target.value; if (!theme || unlockedThemeIds.includes(theme)) void runtime.setTheme(theme || null) }}>
          {OFFICE_THEME_CHOICES.map(theme=>{
            const locked=!!theme.id && !unlockedThemeIds.includes(theme.id)
            return <option key={theme.id ?? 'classic'} value={theme.id ?? ''} disabled={locked}>{theme.name}{locked?' · 待解锁':''}</option>
          })}
        </select></label> : <label>卧室主题
        <select aria-label="卧室主题" value={bedroomTheme ?? ''} disabled={presentationDisabled}
          onChange={event=>{ const theme=event.target.value; if (!theme || unlockedThemeIds.includes(theme)) void runtime.setBedroomTheme(resident,theme || null) }}>
          <option value="">经典卧室</option>
          {COMPANION_REWARDS.map(reward=>{
            const locked=!unlockedThemeIds.includes(reward.bedroom)
            const other=Object.entries(bedrooms).find(([id,theme])=>id!==resident && theme===reward.bedroom)?.[0]
            const otherOwner=OFFICE_OUTFIT_CHOICES.find(choice=>choice.employeeId===other && unlockedEmployeeIds.includes(choice.employeeId))
            return <option key={reward.bedroom} value={reward.bedroom} disabled={locked}>{reward.name}主题{locked?' · 待解锁':otherOwner?' · 从'+otherOwner.name+'的卧室移入':''}</option>
          })}
        </select></label>}
      {onOpenRewards && <button type="button" onClick={onOpenRewards}>查看主题解锁进度</button>}
    </section>}
    {panel==='roster' && <section className="lumaOfficePanel" aria-label="AI 员工列表">
      <div className="lumaOfficePanelTitle"><h2>我的伙伴</h2><span>{unlockedEmployeeIds.length} 位已加入</span>
        {onOpenRewards && <button type="button" onClick={onOpenRewards}>邀请伙伴</button>}</div>
      <ul className="lumaOfficeTeamGrid">{employees.map(employee=>{
        const id=employee.id as ResidentId
        return <li key={id}>
          <MessageAvatar {...getChibiAvatar(id,selection.employeeSkins[id])}/>
          <div><strong>{employee.name}</strong><small>{employee.location==='office'?'办公室 · '+employee.activity:employee.location==='bedroom'?'卧室 · '+(policy.bedtime?'休息中':'自由活动'):'位置待同步'}</small></div>
          <div className="lumaOfficeMemberActions">
            <button type="button" onClick={()=>visit(id)} aria-label={'进入'+employee.name+'的卧室'}>卧室</button>
            <button type="button" onClick={()=>dress(id)} aria-label={employee.name+'换装'}>换装</button>
            <button type="button" onClick={()=>onOpenChat(id)} aria-label={'联系'+employee.name}>联系</button>
          </div>
        </li>})}</ul>
    </section>}
    {panel==='wardrobe' && <OfficeWardrobe id={resident} selected={selection.employeeSkins[resident]} unlockedEmployeeIds={unlockedEmployeeIds}
      disabled={presentationDisabled} onSelect={setResident} onEquip={skin=>void runtime.setOutfit(resident,skin)} onClose={()=>setPanel(null)}/>}
    <div className={'lumaStudioCanvas'+(expanded?' is-expanded':'')}>
      {officeVisible ? <>
        <div className="lumaDshOfficeRoom">
          <OfficeSceneSurface employees={inOffice} reports={snapshot.projection.officeReportMarkers.filter(report=>unlockedEmployeeIds.includes(report.employeeId))}
            commands={snapshot.commands.filter(command=>inOffice.some(employee=>employee.id===command.employeeId))} timePolicy={scenePolicy}
            presentationActive={active} reduceMotion={reduceMotion || snapshot.motionPreference === 'reduce'}
            unavailableAssetIds={unavailableHistoricalRestArt} {...officeTheme ? {officeTheme} : {}}
            employeeSkins={selection.employeeSkins} employeeDestination="contact" onCharacterClick={onOpenChat}
            onBindWorkstation={(employeeId, workstationId)=>runtime.bindWorkstation(employeeId,workstationId)}
            onSceneEvent={event=>runtime.handleSceneEvent(event)}
            onReportClick={reportId=>{void runtime.openReport(reportId).then(employeeId=>{if(employeeId) onOpenChat(employeeId)})}}/>
        </div>
        <div className="lumaRoomCaption">
          <p>{inOffice.length ? <>点选伙伴发消息<span> · 长按空闲伙伴调整工位</span></>
            : snapshot.persistence === 'loading' || snapshot.persistence === 'unavailable' ? '等待同步员工位置' : '伙伴已回卧室休息'}</p>
          {!inOffice.length && selectedEmployee?.location==='bedroom' && <button type="button" onClick={()=>visit(resident)}>去卧室看看</button>}
        </div>
      </> : <OfficeBedroom hasInspector key={[resident,selectedEmployee?.location,policy.bedtime].join('/')} id={resident} name={owner.name}
          skinId={selection.employeeSkins[resident]} themeOwner={roomArtOwner} phase={policy.phase}
          bedtime={policy.bedtime === true && selectedEmployee?.taskState==='idle'} location={selectedEmployee?.location ?? 'unknown'}
          officeActivity={selectedEmployee?.activity ?? ''} onChat={()=>onOpenChat(resident)} onOffice={()=>setScene('office')} onWardrobe={()=>dress(resident)}
          onAssign={()=>onOpenChat(resident,'task')}/>}
      <button className="lumaCanvasZoom" type="button" aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}>
        {expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>} {expanded?'还原场景':'放大场景'}
      </button>
    </div>
  </section>
}
