import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SeatedActor } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSprites.tsx'
import { getOfficeAsset } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { getBrowserOfficeDefaultSkinId, getEmployeeSkinPack } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { deskFrameRegistration } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskFrameRegistration.ts'
import { OFFICE_NAV_HEIGHT, OFFICE_NAV_WIDTH } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/navigation.ts'
import { OFFICE_WORKSTATION_KEYBOARD_BOUNDS } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/workstationProps.ts'
import { compileOfficeEmployeeOcclusionPolygons } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneGeometry.ts'

it('keeps the private desk hands registered to the real keyboard across every complete typing frame', () => {
  for (const id of ['gemini', 'grok']) for (const workstationId of ['private-upper', 'private-lower'] as const) {
    const pack = getEmployeeSkinPack(id, getBrowserOfficeDefaultSkinId(id))!
    const art = getOfficeAsset(pack.assets.typing.back), hand = pack.typingProfiles.back.landmarks.hand
    const keys = OFFICE_WORKSTATION_KEYBOARD_BOUNDS[workstationId]!
    for (let frame = 0; frame < 4; frame++) {
      const html = renderToStaticMarkup(<SeatedActor employee={{ id, name:id, sceneActivity:'idle', availability:'available', activity:'', canDrag:true }}
        workstationId={workstationId} onClick={() => {}} onContextMenu={() => {}}
        review={{employeeId:id, workstationId, mode:'working', frameIndex:frame}} />)
      const button = new DOMParser().parseFromString(html, 'text/html').querySelector('button')!
      const anchor = button.style.transformOrigin.split(' ').map(value => parseFloat(value) / 100)
      const [shiftX, shiftY] = deskFrameRegistration(art.sha256, frame)!
      expect(button.dataset.typingFacing).toBe('back')
      expect(parseFloat(button.style.left) * OFFICE_NAV_WIDTH / 100).toBeCloseTo((keys.left + keys.right) / 2)
      expect(parseFloat(button.style.top) * OFFICE_NAV_HEIGHT / 100).toBeCloseTo((keys.top + keys.bottom) / 2)
      expect(anchor[0]! * 512 + shiftX).toBeCloseTo(hand.x * 512)
      expect(anchor[1]! * 860 + shiftY).toBeCloseTo(hand.y * 860)
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
