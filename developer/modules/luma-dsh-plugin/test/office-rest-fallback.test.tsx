import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OfficeSceneSurface } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSurface.tsx'
import { createOfficeTimePolicy } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'

// Fix only the initial heading and image boundary. The real scene chooses the
// catalog/action/resource and passes that exact ID to its image consumer.
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneActorRuntime.ts', async importOriginal => {
  const original = await importOriginal<typeof import('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneActorRuntime.ts')>()
  return { ...original, initialRuntime: (...args: Parameters<typeof original.initialRuntime>) => ({ ...original.initialRuntime(...args), direction: 'right' }) }
})
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneSprites.tsx', () => ({
  SpriteStripCanvas: ({ assetId, paused }: { assetId: string; paused: boolean }) => <canvas data-testid="sprite-request" data-asset-id={assetId} data-paused={String(paused)} />,
  SeatedActor: () => null,
}))
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeSceneLighting.tsx', () => ({
  useOfficeSceneLighting: () => ({ lighting: { current: null, previous: null, status: 'loading' }, lightingControllerRef: { current: null } }),
  OfficeLightingImages: () => null,
}))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('parks on the planted pose and falls back through the outfit still and matching walk if the authored resources are unavailable', () => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const images: HTMLImageElement[] = []
  vi.stubGlobal('Image', class { constructor() {
    const image=document.createElement('img')
    images.push(image)
    return image
  } })
  const props = { employees: [{ id: 'lu-mi', name: '陆弥', activity: '等待新任务', availability: 'available' as const,
    sceneActivity: 'idle' as const, canDrag: true }], reports: [], presentationActive: false,
    timePolicy: createOfficeTimePolicy({ date: new Date(2026, 10, 16, 9) }) }
  const view = render(<OfficeSceneSurface {...props} />)
  expect(view.container.querySelector('canvas[data-actor-motion="idle"]')).toBeTruthy()
  const articulated=images.find(image=>image.src.includes('/actor-poses/'))
  expect(articulated).toBeDefined()
  act(()=>{articulated!.dispatchEvent(new Event('error'))})
  expect(view.getByTestId('sprite-request').dataset.assetId).toBe('employee.lu-mi.rest.right.plugin-r1')
  view.rerender(<OfficeSceneSurface {...props} unavailableAssetIds={['employee.lu-mi.rest.left.plugin-r1', 'employee.lu-mi.rest.right.plugin-r1']} />)
  expect(view.getByTestId('sprite-request').dataset.assetId).toBe('employee.lu-mi.walk.right.v3')
  expect(view.getByTestId('sprite-request').dataset.paused).toBe('true')
  expect(view.container.querySelector('[data-asset-id*="rest."]')).toBeNull()
})
