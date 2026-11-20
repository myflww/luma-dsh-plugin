import { expect, it } from 'vitest'
import { projectPluginSceneEmployees } from '../src/client/office-scene-employees.ts'
import { createOfficeTimePolicy } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import type { OfficeEmployeeVisualState } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/HarnessOfficeProjectionAdapter.ts'

function idle(employeeId:string): OfficeEmployeeVisualState {
  return {employeeId, displayName:employeeId, taskState:'idle', sceneActivity:'idle', attention:null,
    canDrag:true, report:null, activeJobCount:0, artifactCount:0}
}

it('reserves Host assignments, seats unbound workbench jobs first, and keeps daily desk activity separate',()=>{
  const roster = ['shan','lu-mi','bai-shuangming','longmama','claude','jingyuniang','gemini','grok'].map(idle)
  roster[0] = { ...idle('shan'), workstationId:'north-private' }
  const at = (hour:number) => {
    const date = new Date(2026,10,19,hour)
    return projectPluginSceneEmployees(roster,['grok'],createOfficeTimePolicy({date}),date)
  }
  const employees = at(11)
  expect(employees[0]).toMatchObject({workstationId:'north-private',ambientDesk:false})
  expect(employees[7]).toMatchObject({workstationId:'north-center',taskState:'running',sceneActivity:'working',canDrag:false,ambientDesk:false})
  const daily = employees.filter(e=>e.ambientDesk)
  expect(daily).toHaveLength(3)
  expect(daily.every(e=>e.taskState==='idle'&&e.canDrag)).toBe(true)
  const seats = employees.flatMap(e=>e.workstationId?[e.workstationId]:[])
  expect(new Set(seats).size).toBe(seats.length)
  expect(roster.filter(e=>e.workstationId)).toHaveLength(1)
  expect(at(12).map(e => e.workstationId)).toEqual(employees.map(e => e.workstationId))
  expect(at(12).filter(e => e.ambientDesk)).toHaveLength(0)
  expect(at(12).find(e => e.id === 'lu-mi')?.activity).toBe('午间休息')
  expect(at(13).filter(e => e.ambientDesk).map(e=>e.id)).not.toEqual(daily.map(e=>e.id))
  expect(at(19).filter(e=>e.ambientDesk)).toHaveLength(0)
  expect(at(19).find(e=>e.id==='grok')).toMatchObject({taskState:'running',workstationId:'north-center'})
})
