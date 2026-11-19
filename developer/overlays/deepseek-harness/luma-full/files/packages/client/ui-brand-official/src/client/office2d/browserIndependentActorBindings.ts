import { getOfficeAsset, resolveOfficeAssetUrl } from './assets.ts'
import { getEmployeeSkinPack, getBrowserOfficeDefaultSkinId } from './employeeSkins.ts'
import type { IndependentOfficeSpace, IndependentRenderBinding } from './generatedIndependentSpaceTypes.ts'

type Point = readonly [number, number]
const ACTORS = ['gemini', 'grok'] as const
const FACES = ['back', 'backLeft', 'backRight', 'front'] as const
const length = (point: Point) => Math.hypot(point[0], point[1])
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]

/** Own complete artwork only. Candidate construction is distinct from Browser visual admission. */
export function buildBrowserIndependentActorBindings(space: IndependentOfficeSpace, visualReviewed = false): readonly IndependentRenderBinding[] {
  return ACTORS.flatMap(employeeId => {
    const skinId = `skin.${employeeId}.v1`, pack = getEmployeeSkinPack(employeeId, skinId)
    if (!pack || getBrowserOfficeDefaultSkinId(employeeId) !== skinId) return []
    return space.layout.stations.flatMap(station => {
      const target = subtract(station.keyboard, station.seat)
      const candidates = FACES.filter(facing => station.facing === 'front' ? facing === 'front' : facing !== 'front').map(facing => {
        const profile = pack.typingProfiles[facing], asset = getOfficeAsset(pack.assets.typing[facing]), strip = asset.frameStrip
        if (!strip || strip.frameCount !== 4 || strip.frameWidth !== 512 || strip.frameHeight !== 860
          || !asset.id.startsWith(`employee.${employeeId}.skin.v1.typing.`)) throw new Error('Browser actor must retain its own exact four-frame source')
        const pixels = Object.fromEntries(Object.entries(profile.landmarks).map(([key, uv]) => [key, [uv.x * 512, uv.y * 860] as Point])) as Record<'hip' | 'hand' | 'head' | 'foot', Point>
        const vector = subtract(pixels.hand, pixels.hip)
        const headPixels = (profile as typeof profile & { headHeightPx: number }).headHeightPx
        if (!(headPixels > 0)) throw new Error('Browser actor needs its own measured head reference')
        const prior = station.height * .25 / headPixels
        // A small head-size regularizer prevents a nearly vertical source hand
        // from becoming huge to reach a diagonally authored keyboard.
        const regularizer = headPixels ** 2 * .25
        const fittedScale = (vector[0] * target[0] + vector[1] * target[1] + regularizer * prior)
          / (vector[0] ** 2 + vector[1] ** 2 + regularizer)
        const scale = facing === 'front' ? prior : Math.max(prior * .65, Math.min(prior * 1.45, fittedScale))
        const residual: Point = [target[0] - scale * vector[0], target[1] - scale * vector[1]]
        // This room's reception target is a front counter, not a rear chair.
        // Its own front hands anchor at the desk; the hidden hip discrepancy
        // remains explicit rather than turning the source upside down.
        const origin: Point = facing === 'front'
          ? [station.keyboard[0] - scale * pixels.hand[0], station.keyboard[1] - scale * pixels.hand[1]]
          : [station.seat[0] - scale * pixels.hip[0] + residual[0] * .25, station.seat[1] - scale * pixels.hip[1] + residual[1] * .25]
        const mapped = Object.fromEntries(Object.entries(pixels).map(([key, point]) => [key, [origin[0] + scale * point[0], origin[1] + scale * point[1]] as Point])) as typeof pixels
        const hipError = length(subtract(mapped.hip, station.seat)), handError = length(subtract(mapped.hand, station.keyboard))
        const headError = Math.abs(scale * headPixels - station.height * .25)
        return { facing, profile, asset, strip, pixels, mapped, scale, origin, hipError, handError,
          score: handError + hipError * 1.5 + headError * .6 + (facing === 'front' ? 18 : 0) }
      }).filter((value): value is NonNullable<typeof value> => value !== undefined).sort((a, b) => a.score - b.score)
      const selected = candidates[0]
      if (!selected) throw new Error('No contained own-source Browser placement')
      const { facing, profile, asset, strip, pixels, mapped, scale, origin, hipError, handError } = selected
      const sourcePath = 'overlays/deepseek-harness/luma-full/files/apps/web/public/luma-office/assets/' + asset.file
      const order = strip.frameOrder ?? [0, 1, 2, 3], durations = strip.frameDurationsMs ?? order.map(() => 1000 / strip.fps)
      const hand = profile.handRect
      const frontHandPolygon = [[hand.x * 512, hand.y * 860], [(hand.x + hand.width) * 512, hand.y * 860],
        [(hand.x + hand.width) * 512, (hand.y + hand.height) * 860], [hand.x * 512, (hand.y + hand.height) * 860]] as readonly Point[]
      const make = (selectionId: string): IndependentRenderBinding => ({ employeeId, skinId: selectionId, stationId: station.id,
        texture: { path: sourcePath, bytes: asset.bytes, sha256: asset.sha256 }, facing,
        frameSize: [strip.frameWidth, strip.frameHeight], frameCount: strip.frameCount, frameOrder: order,
        frameDurationsMs: durations, restFrame: profile.reducedMotionFrame, origin, uniformScale: scale, visualReviewed,
        anatomicalSourcePixels: pixels, mappedCandidatePixels: mapped, candidateContactErrorPixels: { hip: hipError, hand: handError },
        originalIntegratedChairPreserved: profile.integratedChair,
        ...(facing === 'front' ? {
          sourceForegroundPolygons: [frontHandPolygon], sourceForegroundOccluderPolygons: station.foregroundPolygons,
          sourceForegroundSemantics: { coordinateSpace: 'source-frame-pixels' as const, sourceSHA256: asset.sha256, kind: 'authored-front-hands-on-exact-reception-counter' },
          actorFurnitureOwnership: { actor: 'complete-chair-free-person', chair: 'scene', sourceHasChair: false, sceneChairReplacedOrHidden: false },
        } : {}),
        wholeSourceTransform: 'New Browser 20261117 own-outfit mapping: complete original source, one uniform scale and translation; no body fit, mirror, repaint or substituted actor. Keyboard/seat errors are recorded, not claimed physically exact.',
        sourceAnatomyMeasurement: `Own ${skinId}/${facing} authored Browser typing profile; empty selection is an explicit alias of this first outfit, not a second base artwork.`,
        visualReviewReceipt: 'modules/luma-dsh-plugin/office-browser-actor-review.json',
        visualScope: 'New Browser-only practical 2D workstation adaptation. Does not promote a historical Native qualification.',
        sourcePath, sourceSha256: asset.sha256, browserSrc: resolveOfficeAssetUrl(asset.id),
      })
      return [make(skinId), make('')]
    })
  })
}

/** A narrow Browser fit for the authored front counter. The old Source27
 * transform made this actor obscure a neighbour; source art/landmarks remain
 * exact, and the new scale keeps its own palms on the same authored keyboard. */
function fitWhaleReception(space: IndependentOfficeSpace, binding: IndependentRenderBinding): IndependentRenderBinding {
  if (space.layout.theme !== 'office.jingyuniang.v1' || binding.employeeId !== 'jingyuniang'
    || binding.stationId !== 'reception' || !binding.anatomicalSourcePixels) return binding
  const station = space.layout.stations.find(row => row.id === binding.stationId)!
  const points = binding.anatomicalSourcePixels, scale = station.height / binding.frameSize[1]
  const origin: Point = [station.keyboard[0] - scale * points.hand[0], station.keyboard[1] - scale * points.hand[1]]
  const mapped = Object.fromEntries(Object.entries(points).map(([key, point]) => [key,
    [origin[0] + scale * point[0], origin[1] + scale * point[1]] as Point])) as typeof points
  const profile = binding.skinId ? getEmployeeSkinPack('jingyuniang', binding.skinId)?.typingProfiles.front : undefined
  const hand = profile?.handRect
  // The base rectangle is measured from this exact original four-frame strip;
  // the outfit rectangle is the author's own profile, never another actor's.
  const handPolygon: readonly Point[] = hand ? [[hand.x * 512, hand.y * 860], [(hand.x + hand.width) * 512, hand.y * 860],
    [(hand.x + hand.width) * 512, (hand.y + hand.height) * 860], [hand.x * 512, (hand.y + hand.height) * 860]]
    : [[145, 550], [330, 550], [330, 620], [145, 620]]
  return { ...binding, uniformScale: scale, origin, mappedCandidatePixels: mapped,
    candidateContactErrorPixels: { hip: length(subtract(mapped.hip, station.seat)), hand: 0 },
    sourceForegroundPolygons: [handPolygon], sourceForegroundOccluderPolygons: station.foregroundPolygons,
    sourceForegroundSemantics: { coordinateSpace: 'source-frame-pixels', sourceSHA256: binding.sourceSha256, kind: 'own-whale-front-palms-on-authored-counter' },
    actorFurnitureOwnership: { actor: 'complete-chair-free-person', chair: 'scene', sourceHasChair: false, sceneChairReplacedOrHidden: false },
    wholeSourceTransform: 'New Browser 20261117 reception fit: original whole source at station-height/frame-height uniform scale, own hand fixed to exact keyboard. Keeps the neighbour visible; no source pixels or old Native data changed.',
    visualReviewReceipt: 'modules/luma-dsh-plugin/office-browser-actor-review.json',
    visualScope: 'New Browser-only practical 2D counter fit. Historical Native transform and approval are unchanged.',
  }
}

/** Used after the new Browser review; Source27 constants remain unchanged. */
export function withBrowserIndependentActors(space: IndependentOfficeSpace): IndependentOfficeSpace {
  const identities = new Set(space.layout.renderBindings.map(row => [row.employeeId, row.skinId, row.stationId].join('\0')))
  return { ...space, layout: { ...space.layout, renderBindings: [...space.layout.renderBindings.map(row => fitWhaleReception(space, row)),
    ...buildBrowserIndependentActorBindings(space, true).filter(row => !identities.has([row.employeeId, row.skinId, row.stationId].join('\0')))] } }
}
