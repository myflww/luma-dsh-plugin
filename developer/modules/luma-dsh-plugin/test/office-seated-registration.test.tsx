import { getRoomSeatedDrawing } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/roomSeated.ts'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { SeatedActor } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSprites.tsx'
import { compileOfficeEmployeeOcclusionPolygons } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneGeometry.ts'
import { officeDeskPlacement, officeDeskShell, officeDeskFrame } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeDeskPlacement.ts'
import { officeKeyboardContact } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeKeyboardContact.ts'
import { OFFICE_WORKSTATION_DIRECTORY } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/workstations.ts'
import { drawOfficeDeskFrame } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/drawOfficeDeskFrame.ts'
import { standingFigureHeight } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeFigureScale.ts'

it('paints exactly one complete exposure for the hair and hands in every seated view', () => {
  const cases = [
    { theme:'classic', station:{id:'north-private',seat:[809,378]} },
    { theme:'classic', station:{id:'west-studio',seat:[1039,424]} },
    { theme:'classic', station:{id:'private-lower',seat:[266,704]} },
    { theme:'office.claude.v1', station:{id:'north-private',seat:[485,332]} },
    { theme:'classic', station:{id:'reception',seat:[838,753],facing:'front'} },
  ] as const
  for (const {theme,station} of cases) {
    const pose=officeDeskPlacement(theme,station,'jingyuniang')!
    const ctx={drawImage:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn()}
    const img={} as CanvasImageSource
    for(let frame=0;frame<pose.count;frame++){
      ctx.drawImage.mockClear()
      drawOfficeDeskFrame(ctx as unknown as CanvasRenderingContext2D,img,pose,frame,21,34,.5)
      const [w,h]=pose.cell
      const local=pose.mirror || !!pose.hiddenShins
      expect(ctx.drawImage.mock.calls).toEqual([[img,frame*w,pose.bank*h,w,h,local?0:21,local?0:34,w*.5,h*.5]])
    }
    expect(ctx.restore).toHaveBeenCalledTimes(pose.mirror || pose.hiddenShins?pose.count:0)
    expect(ctx.clip).toHaveBeenCalledTimes(pose.facing==='rear'?pose.count:0)
  }
})

it('keeps the front portrait in scale at both depths with its hands still on the counter', () => {
  const portraits = [
    ['gemini', undefined, 39, 48],
    ['jingyuniang', 'skin.jingyuniang.v1', 38, 42],
    ['longmama', undefined, 41, 44],
    ['longmama', 'skin.longmama.v1', 41, 46],
  ] as const
  for(const [id,skin,standingEyeGap,drawnEyeGap] of portraits){
    for(const y of [378,753]){
      const desk=officeDeskPlacement('office.jingyuniang.v1',{
        id:'reception',seat:[390,y],keyboard:[390,y+15],facing:'front',
      },id,skin)!
      expect(desk.palm).toEqual([390,y+12])
      expect(desk.scale * drawnEyeGap).toBeCloseTo(standingFigureHeight(y)*.355/116*standingEyeGap, 8)
    }
  }
})

it('registers Lu Mi’s visible crown at the same camera scale in both outfits',()=>{
  for(const skin of [undefined,'skin.lu-mi.v1']){
    for(const [facing,angle,fraction] of [['front','front',.355],['back','rear',.35]] as const){
      const front=facing==='front'
      const pose=officeDeskPlacement('classic',front?{id:'reception',seat:[838,753],facing}:{id:'north-private',seat:[809,378],facing},'lu-mi',skin)!
      const model=getRoomSeatedDrawing('lu-mi',skin,angle)!
      expect(pose.src).toBe(model.src)
      expect(pose.scale*model.crownWidth).toBeCloseTo(standingFigureHeight(front?753:378)*fraction,8)
      expect(model.sourceSrc).toContain(front?'typing-front':'typing-back')
      expect(model.count).toBe(8)
    }
  }
})

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
      const shallow=['north-center','west-studio','south-right'].includes(station.id)
      const facing=station.zone==='private-office'?'rearLeft':shallow?'rearRight':'rear'
      expect(button.dataset.deskView).toBe(facing)
      if(shallow){
        if(id==='lu-mi')expect(pose.src).toContain('shallowRight')
        else expect(pose.bank).toBe(2)
        expect(Math.abs(pose.hip[0]-station.seatPoint[0])).toBeLessThanOrEqual(7)
        const contact=officeKeyboardContact('classic',station.id,pose.palm)!
        expect(Math.hypot(contact[0]-pose.palm[0],contact[1]-pose.palm[1])).toBeLessThan(6)
      }
      expect(button.querySelectorAll('canvas')).toHaveLength(1)
      expect(Boolean(pose.hiddenShins)).toBe(pose.facing==='rear')
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
