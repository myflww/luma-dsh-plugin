import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SeatedActor } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSprites.tsx'
import { getOfficeAsset } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { getEmployeeCatalogWithSkin } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { deskFrameRegistration } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskFrameRegistration.ts'
import { OFFICE_NAV_HEIGHT, OFFICE_NAV_WIDTH } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/navigation.ts'
import { officeRearHands } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeKeyboardContact.ts'
import { compileOfficeEmployeeOcclusionPolygons } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneGeometry.ts'

it('places all rear outfits on the visible private-desk keys through all four exposures', () => {
  // Endpoints inside the two diagonal key beds, measured on the noon plate.
  const beds = {
    'private-upper': {center:[162,465],vector:[8,-5]},
    'private-lower': {center:[234,656],vector:[9,-7]},
  } as const
  for (const id of ['shan','bai-shuangming','lu-mi','claude','jingyuniang','longmama','gemini','grok']) {
    const outfits=['gemini','grok'].includes(id)?[undefined]:[undefined,'skin.'+id+'.v1']
    for(const skinId of outfits)for(const workstationId of ['private-upper','private-lower'] as const) {
      const catalog=getEmployeeCatalogWithSkin(id,skinId)!
      const art=getOfficeAsset(catalog.typing.back),hand=officeRearHands[art.sha256]!
      expect(hand).toBeDefined()
      const {center,vector}=beds[workstationId]
      for (let frame=0;frame<4;frame++) {
        const html=renderToStaticMarkup(<SeatedActor employee={{id,name:id,sceneActivity:'idle',availability:'available',activity:'',canDrag:true}}
          skinId={skinId} workstationId={workstationId} onClick={()=>{}} onContextMenu={()=>{}}
          review={{employeeId:id,workstationId,mode:'working',frameIndex:frame}}/>)
        const button=new DOMParser().parseFromString(html,'text/html').querySelector('button')!
        const anchor=button.style.transformOrigin.split(' ').map(value=>parseFloat(value)/100)
        const [shiftX,shiftY]=deskFrameRegistration(art.sha256,frame)!
        const dx=parseFloat(button.style.left)*OFFICE_NAV_WIDTH/100-center[0]
        const dy=parseFloat(button.style.top)*OFFICE_NAV_HEIGHT/100-center[1]
        expect(button.dataset.typingFacing).toBe('back')
        expect(Math.abs(dx)).toBeLessThanOrEqual(vector[0]+.01)
        expect(dy).toBeCloseTo(dx*vector[1]/vector[0])
        expect(anchor[0]!*512+shiftX).toBeCloseTo(hand[0])
        expect(anchor[1]!*860+shiftY).toBeCloseTo(hand[1])
      }
    }
  }
})
it('keeps the front furniture mask fixed to the same world contact when the seated body rotates', () => {
  const [mask] = compileOfficeEmployeeOcclusionPolygons({
    polygons: [[[130, 200], [130, 210]]], base: {x:130,y:200},
    width:100, height:200, anchor:{x:.25,y:.7}, rotation:Math.PI/2, frameWidth:500, frameHeight:800,
  })
  expect(mask![0]).toEqual([125, 560])
  expect(mask![1]).toEqual([175, 560])
})
