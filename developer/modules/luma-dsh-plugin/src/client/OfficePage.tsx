import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { RoomThemePicker } from './RoomThemePicker.tsx'
import { OfficeWardrobe } from './OfficeWardrobe.tsx'
import { projectPluginSceneEmployees } from './office-scene-employees.ts'
import { useAgentWorkRoles } from './agent-work-activity.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import { BedDouble, Building2, ChevronDown, Clock3, Eye, EyeOff, Palette, Scan, Shirt, UsersRound, X } from 'lucide-react'
import { SceneViewport } from './SceneViewport.tsx'
import './ImmersiveOffice.css'
import './OfficePage.css'

export interface OfficePageProps {
  readonly sceneMenu?: ReactNode
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
export function OfficePage({ runtime, onOpenChat, active = true, sceneMenu, unlockedEmployeeIds = [STARTER_EMPLOYEE_ID], unlockedThemeIds = starterThemes, onOpenRewards }: OfficePageProps) {
  const [snapshot, setSnapshot] = useState(() => runtime.getSnapshot())
  const [scene,setScene] = useState<'office'|'bedroom'>('office')
  const [panel,setPanel] = useState<'roster'|'wardrobe'|'themes'|null>(null)
  const [fit, setFit] = useState(false)
  const [toolsHidden, setToolsHidden] = useState(false)
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement|null>(null)
  const panelRef=useRef<HTMLDivElement>(null)
  const opener=useRef<HTMLButtonElement|null>(null)
  const showTools=useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!active) { setPanel(null); return }
    if (!panel && !toolsHidden) return
    if (panel) panelRef.current?.querySelector<HTMLElement>('select:not(:disabled), button:not(:disabled)')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (panel) { setPanel(null); opener.current?.focus() }
      else { setToolsHidden(false); showTools.current?.focus() }
    }
    const onOutside = (event:PointerEvent) => {
      if (!panel || !(event.target instanceof Element) || panelRef.current?.contains(event.target) || event.target.closest('[data-stage-panel-trigger]')) return
      setPanel(null)
    }
    window.addEventListener('keydown',onKey)
    document.addEventListener('pointerdown',onOutside)
    return () => { window.removeEventListener('keydown',onKey); document.removeEventListener('pointerdown',onOutside) }
  },[active,panel,toolsHidden])
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
  const closePanel = () => { setPanel(null); opener.current?.focus() }
  const toggle = (next: NonNullable<typeof panel>,button:HTMLButtonElement) => {
    opener.current=button
    setPanel(current => current===next ? null : next)
  }
  const refreshTools = () => { setPanel(null); setToolsHidden(hidden=>!hidden) }
  return <section className="lumaImmersiveOffice" aria-label="Luma 办公室" data-hud={toolsHidden?'hidden':'visible'}>
    <div className="lumaStageArtwork lumaStudioCanvas">
      {officeVisible ? <SceneViewport fit={fit} ratio={1672/941}>
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
      </SceneViewport> : <OfficeBedroom hasInspector fit={fit} actionsTarget={actionsTarget} key={resident} id={resident} name={owner.name}
          skinId={selection.employeeSkins[resident]} themeOwner={roomArtOwner} phase={policy.phase}
          clock={now} workingDay={policy.isWorkingDate === true} active={active} reduceMotion={reduceMotion || snapshot.motionPreference==='reduce'}
          bedtime={policy.bedtime === true} taskIdle={selectedEmployee?.taskState==='idle'} location={selectedEmployee?.location ?? 'unknown'}
          officeActivity={selectedEmployee?.activity ?? ''} onChat={()=>onOpenChat(resident)} onOffice={()=>setScene('office')} onWardrobe={()=>dress(resident)}
          onAssign={()=>onOpenChat(resident,'task')}/>}
    </div>
    <div className="lumaStageHeader">
      <div className="lumaStageEntry" hidden={toolsHidden}>{sceneMenu}</div>
      <div className="lumaStageTopTools">
        <nav className="lumaStageSwitch" aria-label="空间导览" hidden={toolsHidden}>
          <button type="button" aria-label={officeVisible?'办公室':'返回办公室'} aria-pressed={officeVisible} onClick={()=>{setScene('office');setPanel(null)}}><Building2 size={17}/>办公室</button>
          <button type="button" aria-pressed={!officeVisible} onClick={()=>visit(resident)}><BedDouble size={18}/>伙伴卧室</button>
        </nav>
        <button className="lumaStageEye" ref={showTools} type="button" title={toolsHidden?'显示场景按钮':'隐藏场景按钮'} aria-label={toolsHidden?'显示场景按钮':'隐藏场景按钮'} aria-expanded={!toolsHidden} onClick={refreshTools}>
          {toolsHidden?<Eye size={18}/>:<EyeOff size={18}/>}
        </button>
      </div>
    </div>
    <div className="lumaStageStatus">
      {(presentation.saving || presentation.message) && <p role="status">{presentation.saving?'正在保存装扮…':presentation.message}</p>}
      {snapshot.problem && <p role="alert">{snapshot.problem}</p>}
      {snapshot.persistence !== 'host' && <p role="status">{snapshot.persistence==='loading'?'正在同步员工位置…':snapshot.persistence==='memory'?'工位与会话绑定将在本次连接内保留。':'暂时无法同步员工位置。'}</p>}
    </div>
    <footer className="lumaStageFooter" hidden={toolsHidden}>
      <div className="lumaStageIdentity">
        <div className="lumaStageMeta"><Clock3 size={14}/><span>{shift}</span><time dateTime={now.toISOString()}>{formatOfficeClock(now)}</time>{officeVisible && <span className="lumaStageCount">{inOffice.length} 人在办公室</span>}</div>
        <div className="lumaStageRoomTitle"><h1>{officeVisible?themeTitle:owner.name+'的卧室'}</h1>
          {!officeVisible && <label className="lumaStageRoomPick" title="选择房间"><ChevronDown size={18}/><select aria-label="选择房间" value={resident} onChange={event=>visit(event.target.value as ResidentId)}>
            {OFFICE_OUTFIT_CHOICES.filter(choice=>unlockedEmployeeIds.includes(choice.employeeId)).map(choice=><option key={choice.employeeId} value={choice.employeeId}>{choice.name}的卧室</option>)}
          </select></label>}
        </div>
        <div className="lumaStageContext" ref={setActionsTarget}>
          {officeVisible && !inOffice.length && selectedEmployee?.location==='bedroom' && <button type="button" onClick={()=>visit(resident)}><BedDouble size={15}/>去卧室看看</button>}
        </div>
      </div>
      <div className="lumaStageDock" aria-label="场景工具">
        <button type="button" data-stage-panel-trigger aria-expanded={panel==='themes'} onClick={e=>toggle('themes',e.currentTarget)}><Palette size={18}/>换肤</button>
        <button type="button" data-stage-panel-trigger aria-expanded={panel==='roster'} onClick={e=>toggle('roster',e.currentTarget)}><UsersRound size={18}/>员工列表</button>
        <button type="button" data-stage-panel-trigger aria-expanded={panel==='wardrobe'} onClick={e=>toggle('wardrobe',e.currentTarget)}><Shirt size={18}/>换装</button>
        <button className="lumaStageFit" type="button" title={fit?'铺满画面':'查看全景'} aria-label={fit?'铺满画面':'查看全景'} aria-pressed={fit} onClick={()=>setFit(!fit)}><Scan size={18}/></button>
      </div>
      {panel && <div className="lumaStageFlyout" ref={panelRef} role="dialog" aria-label={{themes:'换肤',roster:'员工列表',wardrobe:'换装'}[panel]}>
        <button className="lumaStageClose" type="button" aria-label="关闭场景面板" onClick={closePanel}><X size={16}/></button>
    {panel==='themes' && <RoomThemePicker space={scene} selected={officeVisible ? officeTheme : bedroomTheme}
      resident={resident} bedrooms={bedrooms} unlocked={unlockedThemeIds} disabled={presentationDisabled}
      onEquip={theme => { if (officeVisible) void runtime.setTheme(theme); else void runtime.setBedroomTheme(resident, theme) }}
      onProgress={onOpenRewards}/>}
    {panel==='roster' && <section className="lumaOfficePanel" aria-label="AI 员工列表">
      <div className="lumaOfficePanelTitle"><h2>我的伙伴</h2><span>{unlockedEmployeeIds.length} 位已加入</span>
        {onOpenRewards && <button type="button" onClick={onOpenRewards}>邀请伙伴</button>}</div>
      <ul className="lumaOfficeTeamGrid">{employees.map(employee=>{
        const id=employee.id as ResidentId
        return <li key={id}>
          <MessageAvatar {...getChibiAvatar(id,selection.employeeSkins[id])}/>
          <div><strong>{employee.name}</strong><small>{employee.location==='office'?'办公室 · '+employee.activity:employee.location==='bedroom'?'卧室 · '+(policy.bedtime && employee.taskState==='idle'?'已入睡':employee.taskState!=='idle'?employee.activity:'自由活动'):'位置待同步'}</small></div>
          <div className="lumaOfficeMemberActions">
            <button type="button" onClick={()=>visit(id)} aria-label={'进入'+employee.name+'的卧室'}>卧室</button>
            <button type="button" onClick={()=>dress(id)} aria-label={employee.name+'换装'}>换装</button>
            <button type="button" onClick={()=>onOpenChat(id)} aria-label={'联系'+employee.name}>联系</button>
          </div>
        </li>})}</ul>
    </section>}
    {panel==='wardrobe' && <OfficeWardrobe id={resident} selected={selection.employeeSkins[resident]} unlockedEmployeeIds={unlockedEmployeeIds}
      disabled={presentationDisabled} onSelect={setResident} onEquip={skin=>void runtime.setOutfit(resident,skin)}/>}
      </div>}
    </footer>
  </section>
}
