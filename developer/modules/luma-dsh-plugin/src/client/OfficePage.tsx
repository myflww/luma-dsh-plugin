import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { OfficeSceneSurface } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSurface.tsx'
import { createOfficeTimePolicy, formatOfficeClock } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import type { DesktopPetDrop } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/scenePlacement.ts'
import type { OfficeAssetId } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeExperience.css'
import type { OfficePageRuntime } from './office-runtime.ts'
import { OFFICE_OUTFIT_CHOICES, OFFICE_THEME_CHOICES } from './office-theme-catalog.ts'
import type { OfficePresentationSelection } from '../office-presentation-settings.ts'
import { COMPANION_REWARDS, STARTER_EMPLOYEE_ID } from '../shared/local-collection-domain.ts'
import { isShopBedroomId } from '../shared/shop-bedrooms.ts'
import { withActiveTaskMonitors } from './office-presence.ts'
import { OfficeBedroom, type ResidentId } from './OfficeBedroom.tsx'
import { canResumeBedroomRoutine } from './bedroom-routine.ts'
import { RoomThemePicker } from './RoomThemePicker.tsx'
import { useContactDirectory } from './ContactDirectory.tsx'
import { OfficeWardrobe } from './OfficeWardrobe.tsx'
import { OfficeName } from './OfficeName.tsx'
import { OfficePaperPlane } from './OfficePaperPlane.tsx'
import { projectPluginSceneEmployees } from './office-scene-employees.ts'
import { useAgentWorkRoles } from './agent-work-activity.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import { EmployeeUsageMeter, describeEmployeeUsage, useEmployeeUsage } from './EmployeeUsagePanel.tsx'
import type { LocalCollectionRuntime } from './local-collection-store.ts'
import { BedDouble, Building2, ChevronDown, ChevronRight, Clock3, Eye, EyeOff, Palette, Scan, Shirt, UsersRound, X } from 'lucide-react'
import { SceneViewport } from './SceneViewport.tsx'
import './ImmersiveOffice.css'
import './OfficePage.css'

export interface OfficePageProps {
  readonly onDesktopPet?: DesktopPetDrop | undefined
  readonly desktopPetRoleIds?: readonly string[] | undefined
  readonly onRecallDesktopPet?: ((employeeId:string)=>void) | undefined
  readonly sceneMenu?: ReactNode
  readonly runtime: OfficePageRuntime
  readonly readEmployeeUsage?: LocalCollectionRuntime['readEmployeeUsage']
  readonly onOpenChat: (employeeId: string, intent?: 'task') => void
  readonly unlockedEmployeeIds?: readonly string[]
  readonly unlockedThemeIds?: readonly string[]
  readonly onOpenRewards?: () => void
  readonly onOpenBedroomShop?: (()=>void) | undefined
  /** The shell keeps this page mounted so a native workspace selection retains its employee. */
  readonly active?: boolean
}

// Historical whole.v2 bytes remain lost. Newly authored plugin-r1 stills have
// separate IDs and source pins; the old records are never represented as recovered.
const unavailableHistoricalRestArt: readonly OfficeAssetId[] = ['employee.lu-mi.rest.left.whole.v2', 'employee.lu-mi.rest.right.whole.v2']

export function OfficePage({ runtime, readEmployeeUsage, onOpenChat, onDesktopPet, desktopPetRoleIds = [], onRecallDesktopPet, active = true, sceneMenu, unlockedEmployeeIds = [STARTER_EMPLOYEE_ID], unlockedThemeIds = [], onOpenRewards, onOpenBedroomShop }: OfficePageProps) {
  const [snapshot, setSnapshot] = useState(() => runtime.getSnapshot())
  const [scene,setScene] = useState<'office'|'bedroom'>('office')
  const [panel,setPanel] = useState<'roster'|'themes'|null>(null)
  const [wardrobeFor,setWardrobeFor]=useState<ResidentId|null>(null)
  const dressing=panel==='roster' && wardrobeFor!==null && unlockedEmployeeIds.includes(wardrobeFor)
  const [usageFor,setUsageFor]=useState<ResidentId|null>(null)
  const usageId=useId()
  const bedroomNav=useRef<HTMLButtonElement>(null)
  const returnToDressButton=useRef<ResidentId|null>(null)
  const [fit, setFit] = useState(false)
  const [toolsHidden, setToolsHidden] = useState(false)
  const usage = useEmployeeUsage(readEmployeeUsage, active && panel === 'roster' && !dressing && !toolsHidden)
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement|null>(null)
  const panelRef=useRef<HTMLDivElement>(null)
  const opener=useRef<HTMLButtonElement|null>(null)
  const showTools=useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!active) { setPanel(null); return }
    if (!panel && !toolsHidden) return
    if (panel) {
      const backTo=returnToDressButton.current
      const target=dressing ? panelRef.current?.querySelector<HTMLElement>('[data-wardrobe-back]')
        : backTo && panel==='roster' ? panelRef.current?.querySelector<HTMLElement>(`[data-dress-employee="${backTo}"]`) : undefined
      const focusTarget=target ?? panelRef.current?.querySelector<HTMLElement>('select:not(:disabled), button:not(:disabled)')
      focusTarget?.focus()
      if(!dressing) returnToDressButton.current=null
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (dressing) setWardrobeFor(null)
      else if (panel) { setPanel(null); opener.current?.focus() }
      else { setToolsHidden(false); showTools.current?.focus() }
    }
    const onOutside = (event:PointerEvent) => {
      if (!panel || !(event.target instanceof Element) || panelRef.current?.contains(event.target) || event.target.closest('[data-stage-panel-trigger]')) return
      setPanel(null)
    }
    window.addEventListener('keydown',onKey)
    document.addEventListener('pointerdown',onOutside)
    return () => { window.removeEventListener('keydown',onKey); document.removeEventListener('pointerdown',onOutside) }
  },[active,panel,toolsHidden,dressing])
  const {names} = useContactDirectory()
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
    .map(employee=>names[employee.id] ? {...employee,name:names[employee.id]!} : employee)
  const inOffice = employees.filter(employee => employee.location === 'office' && !desktopPetRoleIds.includes(employee.id))
  const scenePolicy = withActiveTaskMonitors(policy, inOffice.some(employee => employee.availability === 'working'))
  const selectedEmployee = employees.find(employee=>employee.id === resident)
  const resting = employees.filter(employee=>employee.location==='bedroom' && !desktopPetRoleIds.includes(employee.id))
  const bedroomVisit = resting.find(employee=>employee.id===resident) ?? resting[0]
  const owner = OFFICE_OUTFIT_CHOICES.find(choice=>choice.employeeId === resident)!
  const visit = (id:ResidentId) => { setResident(id); setPanel(null); setScene('bedroom') }
  const officeTheme = selection.officeTheme && unlockedThemeIds.includes(selection.officeTheme) ? selection.officeTheme : null
  const bedrooms: NonNullable<OfficePresentationSelection['bedroomThemes']> = selection.bedroomThemes ?? {}
  const equippedBedroom = bedrooms[resident]
  const bedroomTheme = equippedBedroom && unlockedThemeIds.includes(equippedBedroom) ? equippedBedroom : null
  const roomArtOwner = COMPANION_REWARDS.find(reward => reward.bedroom === bedroomTheme)?.id
  const themeTitle = OFFICE_THEME_CHOICES.find(theme => theme.id === officeTheme)?.name ?? '办公室'
  const shift = !policy.isWorkingDate ? '休息日' : policy.isWorkPeriod ? '上班中' : policy.attendancePeriod === 'lunch' ? '午休中' : policy.hour < 9 ? '上班前' : '已下班'
  const officeVisible = scene === 'office'
  const closePanel = () => { setPanel(null); opener.current?.focus() }
  const toggle = (next: NonNullable<typeof panel>,button:HTMLButtonElement) => {
    opener.current=button
    returnToDressButton.current=null
    setWardrobeFor(null)
    setUsageFor(null)
    setPanel(current => current===next ? null : next)
  }
  const refreshTools = () => { setPanel(null); setToolsHidden(hidden=>!hidden) }
  return <section className="lumaImmersiveOffice" aria-label="Luma 办公室" data-hud={toolsHidden?'hidden':'visible'}>
    <div className="lumaStageArtwork lumaStudioCanvas">
      {officeVisible ? <OfficePaperPlane active={active && panel===null && !toolsHidden} actors={inOffice} room={officeTheme}
        toolbar={actionsTarget} reduceMotion={reduceMotion || snapshot.motionPreference==='reduce'}>{pick=><SceneViewport fit={fit} ratio={1672/941}>
        <div className="lumaDshOfficeRoom">
          <OfficeSceneSurface employees={inOffice} reports={snapshot.projection.officeReportMarkers.filter(report=>unlockedEmployeeIds.includes(report.employeeId))}
            commands={snapshot.commands.filter(command=>inOffice.some(employee=>employee.id===command.employeeId))} timePolicy={scenePolicy}
            presentationActive={active} reduceMotion={reduceMotion || snapshot.motionPreference === 'reduce'}
            unavailableAssetIds={unavailableHistoricalRestArt} {...officeTheme ? {officeTheme} : {}}
            employeeSkins={selection.employeeSkins} employeeDestination="contact" onCharacterClick={onOpenChat}
            onDesktopPet={onDesktopPet} paperPlanePick={pick}
            onBindWorkstation={(employeeId, workstationId)=>runtime.bindWorkstation(employeeId,workstationId,{swap:true},employees)}
            onSceneEvent={event=>runtime.handleSceneEvent(event)}
            onReportClick={reportId=>{void runtime.openReport(reportId).then(employeeId=>{if(employeeId) onOpenChat(employeeId)})}}/>
        </div>
      </SceneViewport>}</OfficePaperPlane> : <OfficeBedroom hasInspector fit={fit} actionsTarget={actionsTarget} key={resident+':'+(bedroomTheme ?? 'classic')} onDesktopPet={onDesktopPet} onDesktop={desktopPetRoleIds.includes(resident)} id={resident} name={names[resident] ?? owner.name}
          {...isShopBedroomId(bedroomTheme)?{roomLayout:bedroomTheme}:{}}
          skinId={selection.employeeSkins[resident]} themeOwner={roomArtOwner} phase={policy.phase}
          clock={now} workingDay={policy.isWorkingDate === true} active={active} reduceMotion={reduceMotion || snapshot.motionPreference==='reduce'}
          bedtime={policy.bedtime === true} taskIdle={canResumeBedroomRoutine(selectedEmployee?.taskState)} location={selectedEmployee?.location ?? 'unknown'}
          officeActivity={selectedEmployee?.activity ?? ''} onChat={()=>onOpenChat(resident)} onOffice={()=>setScene('office')}
          onAssign={()=>onOpenChat(resident,'task')}/>}
    </div>
    <div className="lumaStageHeader">
      <div className="lumaStageEntry" hidden={toolsHidden}>{sceneMenu}</div>
      <div className="lumaStageTopTools">
        <nav className="lumaStageSwitch" aria-label="空间导览" hidden={toolsHidden}>
          <button type="button" aria-label={officeVisible?'办公室':'返回办公室'} aria-pressed={officeVisible} onClick={()=>{setScene('office');setPanel(null)}}><Building2 size={17}/>办公室</button>
          <button ref={bedroomNav} type="button" aria-pressed={!officeVisible} onClick={()=>visit(resident)}><BedDouble size={18}/>伙伴卧室</button>
        </nav>
        <button className="lumaStageEye" ref={showTools} type="button" title={toolsHidden?'显示场景按钮':'隐藏场景按钮'} aria-label={toolsHidden?'显示场景按钮':'隐藏场景按钮'} aria-expanded={!toolsHidden} onClick={refreshTools}>
          {toolsHidden?<Eye size={18}/>:<EyeOff size={18}/>}
        </button>
      </div>
    </div>
    <div className="lumaStageStatus">
      {(presentation.saving || presentation.message) && <p role="status">{presentation.saving?'正在保存…':presentation.message}</p>}
      {snapshot.problem && <p role="alert">{snapshot.problem}</p>}
      {snapshot.persistence !== 'host' && <p role="status">{snapshot.persistence==='loading'?'正在同步员工位置…':snapshot.persistence==='memory'?'工位与会话绑定将在本次连接内保留。':'暂时无法同步员工位置。'}</p>}
    </div>
    <footer className="lumaStageFooter" hidden={toolsHidden}>
      <div className="lumaStageIdentity">
        <div className="lumaRoomSignature">
        <div className="lumaRoomEmblem" aria-hidden="true">{officeVisible?<Building2 size={24}/>:<MessageAvatar {...getChibiAvatar(resident,selection.employeeSkins[resident])}/>}</div>
        <div>
        <div className="lumaStageRoomTitle">{officeVisible ? <OfficeName key={officeTheme ?? 'classic'}
          name={selection.officeNames?.[officeTheme ?? 'classic'] ?? themeTitle} defaultName={themeTitle}
          canEdit={presentation.canEdit} save={name=>runtime.setOfficeName(officeTheme,name)}/>
          : <h1>{(names[resident] ?? owner.name)+'的卧室'}</h1>}
          {!officeVisible && <label className="lumaStageRoomPick" title="选择房间"><ChevronDown size={18}/><select aria-label="选择房间" value={resident} onChange={event=>visit(event.target.value as ResidentId)}>
            {OFFICE_OUTFIT_CHOICES.filter(choice=>unlockedEmployeeIds.includes(choice.employeeId)).map(choice=><option key={choice.employeeId} value={choice.employeeId}>{names[choice.employeeId] ?? choice.name}的卧室</option>)}
          </select></label>}
        </div>
        <div className="lumaStageMeta"><Clock3 size={13}/><time dateTime={now.toISOString()}>{formatOfficeClock(now)}</time><span>{shift}</span>{officeVisible && <span className="lumaStageCount">{inOffice.length} 人在办公室</span>}</div>
        </div></div>
        <div className="lumaStageContext" ref={setActionsTarget}>
          {officeVisible && !inOffice.length && bedroomVisit && <button type="button" onClick={()=>visit(bedroomVisit.id as ResidentId)}><BedDouble size={15}/>去{bedroomVisit.name}的卧室</button>}
        </div>
      </div>
      <div className="lumaStageDock" role="group" aria-label="场景工具">
        <button type="button" data-stage-panel-trigger aria-expanded={panel==='roster'} onClick={e=>toggle('roster',e.currentTarget)}><UsersRound size={18}/>员工列表</button>
        <button type="button" data-stage-panel-trigger aria-expanded={panel==='themes'} onClick={e=>toggle('themes',e.currentTarget)}><Palette size={18}/>换肤</button>
        <button className="lumaStageFit" type="button" title={fit?'铺满画面':'查看全景'} aria-label={fit?'铺满画面':'查看全景'} aria-pressed={fit} onClick={()=>setFit(!fit)}><Scan size={18}/></button>
      </div>
      {panel && <div className="lumaStageFlyout" data-panel={panel} ref={panelRef} role="dialog" aria-label={panel==='themes'?'换肤':'员工列表'}>
        <button className="lumaStageClose" type="button" aria-label="关闭场景面板" onClick={closePanel}><X size={16}/></button>
    {panel==='themes' && <RoomThemePicker space={scene} selected={officeVisible ? officeTheme : bedroomTheme}
      resident={resident} bedrooms={bedrooms} unlocked={unlockedThemeIds} disabled={presentationDisabled}
      onEquip={theme => { if (officeVisible) void runtime.setTheme(theme); else void runtime.setBedroomTheme(resident, theme) }}
      onProgress={onOpenRewards} onShop={onOpenBedroomShop}/>}
    {panel==='roster' && !dressing && <section className="lumaOfficePanel" aria-label="AI 员工列表">
      <div className="lumaOfficePanelTitle"><h2>我的伙伴</h2><span>{unlockedEmployeeIds.length} 位已加入</span>
        {onOpenRewards && <button type="button" onClick={onOpenRewards}>邀请伙伴</button>}</div>
      <ul className="lumaOfficeTeamGrid">{employees.map(employee=>{
        const id=employee.id as ResidentId
        const usageRow = usage.data?.roles[id]
        return <li key={id} className="lumaCrewRow">
          <button type="button" className="lumaCrewSummary" aria-label={'进入'+employee.name+'的卧室'} onClick={()=>{visit(id);bedroomNav.current?.focus()}}>
          <MessageAvatar {...getChibiAvatar(id,selection.employeeSkins[id])}/>
          <span><strong>{employee.name}</strong><small>{desktopPetRoleIds.includes(id)?'桌面陪伴中':employee.location==='office'?'办公室 · '+employee.activity:employee.location==='bedroom'?'卧室 · '+(canResumeBedroomRoutine(employee.taskState)?policy.bedtime?'已入睡':'自由活动':employee.activity):'位置待同步'}</small></span>
          <ChevronRight size={16} aria-hidden="true"/></button>
          <div className="lumaOfficeMemberActions" role="group" aria-label={employee.name+'的操作'}>
            <button type="button" data-dress-employee={id} onClick={()=>{returnToDressButton.current=id;setWardrobeFor(id)}} aria-label={employee.name+'换装'}><Shirt size={14} aria-hidden="true"/>换装</button>
            {desktopPetRoleIds.includes(id) ? onRecallDesktopPet && <button type="button" aria-label={'让'+employee.name+'回到场景'} onClick={()=>onRecallDesktopPet(id)}>回到场景</button>
              : onDesktopPet && <button type="button" aria-label={'让'+employee.name+'到桌面陪伴'} onClick={()=>onDesktopPet(id)}>桌宠</button>}
          </div>
          {usageRow && usage.data
            ? <div className="lumaCrewProgress"><EmployeeUsageMeter compact name={employee.name} row={usageRow} threshold={usage.data.threshold}/>
                <button type="button" aria-label={'查看'+employee.name+'的星币进度'} aria-expanded={usageFor===id}
                  aria-controls={usageId+'-'+id} onClick={()=>setUsageFor(current=>current===id?null:id)}/></div>
            : <span className="lumaRosterMeterState">{usage.loading ? '读取用量…' : '用量待同步'}</span>}
          {usageRow && usage.data && <p id={usageId+'-'+id} className="lumaCrewUsageDetails" hidden={usageFor!==id}>{describeEmployeeUsage(usageRow,usage.data.threshold)}</p>}
        </li>})}</ul>
      <p className="lumaRosterPlacementHint">拖动伙伴到工位可以换座。{onDesktopPet && '拖出窗口可开启桌面陪伴。'}</p>
      {usage.error ? <p className="lumaRosterUsageNote" role="status">{usage.error}</p>
        : usage.data && !usage.data.nativeHistoryComplete && <p className="lumaRosterUsageNote" role="status">仅显示已同步用量，部分历史会话待核对。</p>}
    </section>}
    {dressing && wardrobeFor && <OfficeWardrobe id={wardrobeFor} selected={selection.employeeSkins[wardrobeFor]} unlockedEmployeeIds={unlockedEmployeeIds}
      disabled={presentationDisabled} onSelect={setWardrobeFor} onEquip={skin=>void runtime.setOutfit(wardrobeFor,skin)} onBack={()=>setWardrobeFor(null)}/>}
      </div>}
    </footer>
  </section>
}
