import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SeatedActor } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSprites.tsx'
import { compileOfficeEmployeeOcclusionPolygons } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneGeometry.ts'
import { officeDeskPlacement, officeDeskShell, officeDeskFrame } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeDeskPlacement.ts'
import { officeKeyboardContact } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeKeyboardContact.ts'
import { OFFICE_WORKSTATION_DIRECTORY } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/workstations.ts'

const employees=['shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok']
it('registers every outfit on the actual chair, turning toward each private desk and keeping the palms on its keys',()=>{
  for(const id of employees){
    const outfits=['gemini','grok'].includes(id)?[undefined]:[undefined,'skin.'+id+'.v1']
    for(const skinId of outfits)for(const station of OFFICE_WORKSTATION_DIRECTORY){
      if(!station.seatPoint)continue
      const pose=officeDeskPlacement('classic',{id:station.id,seat:station.seatPoint},id,skinId)!
      const markup=renderToStaticMarkup(<SeatedActor employee={{id,name:id,sceneActivity:'idle',availability:'available',activity:'',canDrag:true}}
        skinId={skinId} workstationId={station.id} onClick={()=>{}} review={{employeeId:id,workstationId:station.id,mode:'working',frameIndex:0}}/>)
      const button=new DOMParser().parseFromString(markup,'text/html').querySelector('button')!
      expect(button.dataset.deskView).toBe(station.zone==='private-office'?'rearLeft':'rear')
      expect(parseFloat(button.style.left)*16.72).toBeCloseTo(pose.origin[0])
      expect(parseFloat(button.style.top)*9.41).toBeCloseTo(pose.origin[1])
      expect(officeDeskShell('classic',station.id)?.length).toBeGreaterThan(0)
      if(station.zone==='private-office'){
        const contact=officeKeyboardContact('classic',station.id,pose.palm)!
        expect(Math.hypot(contact[0]-pose.palm[0],contact[1]-pose.palm[1])).toBeLessThan(5)
      }
      expect(officeDeskFrame(pose,id,850,false,false)).toBe(0)
      expect(officeDeskFrame(pose,id,850,true,false)).toBeLessThan(pose.count)
    }
  }
})

it('uses the front desk only when the actual chair faces the visitor',()=>{
  for(const id of employees){
    const desk=officeDeskPlacement('classic',{id:'reception',seat:[838,753],facing:'front'},id)
    expect(desk?.facing).toBe('front')
    expect(desk?.palm).toEqual([838,753])
    const rear=officeDeskPlacement('office.claude.v1',{id:'reception',seat:[1220,568],keyboard:[1249,512],facing:'back'},id)
    expect(rear?.facing).toBe('rearRight')
  }
  expect(officeDeskPlacement('classic',{id:'north-private',seat:[809,378]},'shan','skin.unregistered')).toBeUndefined()
})

it('keeps the front furniture mask fixed to the same world contact when the seated body rotates', () => {
  const [mask] = compileOfficeEmployeeOcclusionPolygons({
    polygons: [[[130, 200], [130, 210]]], base: {x:130,y:200},
    width:100, height:200, anchor:{x:.25,y:.7}, rotation:Math.PI/2, frameWidth:500, frameHeight:800,
  })
  expect(mask![0]).toEqual([125, 560])
  expect(mask![1]).toEqual([175, 560])
})
