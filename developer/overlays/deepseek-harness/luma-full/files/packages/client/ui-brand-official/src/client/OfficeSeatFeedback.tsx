import { useCallback, useEffect, useRef, useState } from 'react'
import type { OfficeSceneSurfaceProps } from './OfficeSceneSurface.types.ts'
import { getOfficeWorkstation } from './office2d/workstations.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'

type OfficeSeatRoster = OfficeSceneSurfaceProps['employees']
export type SeatPreview = { employeeId:string; workstationId:OfficeWorkstationId | null }
type SeatReceipt = SeatPreview & { phase:'saving'|'saved'|'error'; text:string }

function seatDescription(roster: OfficeSeatRoster, employeeId:string, seat:OfficeWorkstationId) {
  return {
    actor:roster.find(row=>row.id===employeeId)?.name ?? employeeId,
    other:roster.find(row=>row.id!==employeeId && row.workstationId===seat)?.name,
    station:getOfficeWorkstation(seat)?.label ?? seat,
  }
}

export function useOfficeSeatFeedback(roster:OfficeSeatRoster, onBind:OfficeSceneSurfaceProps['onBindWorkstation'], room:string|undefined, active:boolean) {
  const [receipt,setReceipt]=useState<SeatReceipt|null>(null)
  const revision=useRef(0)
  useEffect(()=>{
    setReceipt(null)
    return ()=>{revision.current++}
  },[room,active])
  useEffect(()=>{
    if(!receipt || receipt.phase==='saving') return
    const timer=setTimeout(()=>setReceipt(null),3900)
    return ()=>clearTimeout(timer)
  },[receipt])
  const bind=useCallback(async(employeeId:string,workstationId:OfficeWorkstationId)=>{
    const seq=++revision.current
    const {actor,other,station}=seatDescription(roster,employeeId,workstationId)
    const notice=(phase:SeatReceipt['phase'],text:string)=>{
      if(seq===revision.current) setReceipt({phase,text,employeeId,workstationId})
    }
    notice('saving',`正在保存${actor}的工位…`)
    try {
      if (!onBind) throw Error('unavailable')
      const result=await onBind(employeeId,workstationId)
      if(result===false || result && typeof result==='object' && 'status' in result && result.status==='rejected') throw Error('rejected')
      const memory=result && typeof result==='object' && 'persistence' in result && result.persistence==='memory'
      notice('saved',`${actor}已调至${station}${other?'，与'+other+'交换工位':''}${memory?'（仅本次会话）':''}`)
      return true
    } catch {
      notice('error',`${actor}的工位未保存，请重试。`)
      return false
    }
  },[roster,onBind])
  const floor=useCallback((employeeId:string,placed:boolean)=>{
    revision.current++
    const name=roster.find(row=>row.id===employeeId)?.name??employeeId
    setReceipt({phase:placed?'saved':'error',employeeId,workstationId:null,
      text:placed?`${name}在这里歇一会儿`:'这里无法落脚，已回到原位'})
  },[roster])
  return {receipt,bind,floor}
}

export function OfficeSeatFeedback({roster,preview,receipt}:{roster:OfficeSeatRoster;preview:SeatPreview|null;receipt:SeatReceipt|null}) {
  let message=receipt?.text
  if(preview){
    if(preview.workstationId){
      const {other,station}=seatDescription(roster,preview.employeeId,preview.workstationId)
      const current=roster.find(row=>row.id===preview.employeeId)?.workstationId===preview.workstationId
      message=`${station} · ${current?'当前工位':other?'松手与'+other+'交换工位':'空位，松手入座'}`
    } else message='松手放在地面，或拖到亮起的工位'
  }
  return <div className="lumaOfficeSeatFeedback" role="status" aria-live="polite" aria-atomic="true"
    data-phase={preview?'preview':receipt?.phase} data-employee-id={preview?.employeeId??receipt?.employeeId}
    data-workstation-id={preview?preview.workstationId??undefined:receipt?.workstationId??undefined}>{message}</div>
}
