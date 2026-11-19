import type { OfficeWorkstationId } from './workstationSeating.ts'

export type OfficeOcclusionPolygon = readonly (readonly [number, number])[]

export interface OfficeWorkstationOcclusion {
  readonly employeeVisiblePolygon: OfficeOcclusionPolygon | null
  /** Actual upper armrests: the only chair parts in front of an occupant. */
  readonly chairArmrestPolygons: readonly OfficeOcclusionPolygon[]
  /** Seat supports, lower spokes and casters remain in the rear prop layer. */
  readonly chairBackgroundStructurePolygons: readonly OfficeOcclusionPolygon[]
  /** Compatibility alias for the explicitly owned armrest foreground. */
  readonly chairForegroundPolygons: readonly OfficeOcclusionPolygon[]
  readonly chairOccluderPolygons: readonly OfficeOcclusionPolygon[]
  readonly rearChairOccluderPolygons: readonly OfficeOcclusionPolygon[]
}

const EMPTY_POLYGONS = Object.freeze([]) as readonly OfficeOcclusionPolygon[]

const freezePolygon = (points: readonly (readonly [number, number])[]): OfficeOcclusionPolygon =>
  Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)))

const freezePolygons = (
  polygons: readonly (readonly (readonly [number, number])[])[],
): readonly OfficeOcclusionPolygon[] => Object.freeze(polygons.map(freezePolygon))

const ordinarySeat = (
  chairArmrestPolygons: readonly (readonly (readonly [number, number])[])[],
  chairBackgroundStructurePolygons: readonly (readonly (readonly [number, number])[])[],
  rearChairOccluderPolygons: readonly (readonly (readonly [number, number])[])[] = [],
): OfficeWorkstationOcclusion => {
  const armrests = freezePolygons(chairArmrestPolygons)
  return Object.freeze({
    employeeVisiblePolygon: null,
    chairArmrestPolygons: armrests,
    chairBackgroundStructurePolygons: freezePolygons(chairBackgroundStructurePolygons),
    chairForegroundPolygons: armrests,
    chairOccluderPolygons: EMPTY_POLYGONS,
    rearChairOccluderPolygons: freezePolygons(rearChairOccluderPolygons),
  })
}

const RECEPTION_EMPLOYEE_VISIBLE_POLYGON = freezePolygon([
  [756, 685], [922, 685], [922, 748], [886, 750], [870, 753],
  [858, 755], [840, 758], [822, 755], [810, 753], [794, 750], [756, 748],
])

const RECEPTION: OfficeWorkstationOcclusion = Object.freeze({
  employeeVisiblePolygon: RECEPTION_EMPLOYEE_VISIBLE_POLYGON,
  chairArmrestPolygons: EMPTY_POLYGONS,
  chairBackgroundStructurePolygons: EMPTY_POLYGONS,
  chairForegroundPolygons: EMPTY_POLYGONS,
  // The front-facing occupant sits in front of this chair's back and arms.
  // Erasing the two old arm-sized rectangles exposed the black chair through
  // sleeves and hair. Only the real counter edge occludes this actor; keep it
  // in employeeVisiblePolygon rather than cutting holes inside the full frame.
  chairOccluderPolygons: EMPTY_POLYGONS,
  rearChairOccluderPolygons: EMPTY_POLYGONS,
})

/**
 * Foreground/rear-chair masks calibrated against the official office geometry. The scene
 * owns these masks; character atlases never bake chairs or monitor pixels.
 */
export const OFFICE_WORKSTATION_OCCLUSION = Object.freeze({
  'north-private': ordinarySeat(
    [
      [[765, 356], [778, 354], [781, 374], [775, 382], [766, 377]],
      [[838, 356], [848, 358], [850, 377], [842, 383], [836, 374]],
    ],
    [
      [[780, 389], [792, 389], [792, 397], [780, 397]],
      [[825, 389], [837, 389], [837, 397], [825, 397]],
    ],
    [
      [[783, 377], [837, 377], [840, 388], [833, 397], [789, 397], [779, 388]],
      [[799, 392], [821, 392], [820, 402], [813, 409], [805, 408], [797, 401]],
    ],
  ),
  'north-center': ordinarySeat(
    [
      [[891, 365], [903, 365], [907, 382], [900, 389], [891, 383]],
      [[955, 372], [965, 375], [966, 391], [958, 397], [952, 386]],
    ],
    [
      [[901, 397], [913, 397], [913, 405], [901, 405]],
      [[940, 399], [952, 399], [952, 407], [940, 407]],
    ],
    [
      [[899, 384], [963, 384], [969, 395], [961, 405], [907, 403], [896, 393]],
      [[917, 398], [941, 398], [941, 410], [934, 419], [926, 420], [916, 410]],
    ],
  ),
  'west-studio': ordinarySeat([
    [[1063, 407], [1077, 411], [1077, 428], [1067, 435], [1060, 423]],
  ], [
    [[1018, 434], [1040, 437], [1039, 443], [1018, 440]],
    [[1039, 437], [1060, 440], [1058, 446], [1039, 443]],
  ]),
  'south-left': ordinarySeat([
    [[632, 564], [647, 560], [651, 581], [644, 590], [633, 583]],
  ], [
    [[650, 596], [702, 595], [702, 603], [650, 604]],
  ]),
  'south-focus': ordinarySeat(
    [
      [[754, 562], [768, 558], [772, 579], [765, 587], [755, 581]],
      [[829, 562], [842, 565], [844, 583], [836, 590], [827, 580]],
    ],
    [
      [[770, 598], [783, 598], [783, 606], [770, 606]],
      [[816, 599], [829, 599], [829, 607], [816, 607]],
    ],
    [
      [[770, 584], [841, 584], [847, 597], [839, 607], [780, 606], [768, 596]],
      [[789, 599], [818, 599], [818, 611], [810, 622], [800, 625], [790, 614]],
    ],
  ),
  'south-right': ordinarySeat([
    [[958, 579], [972, 585], [973, 602], [963, 610], [955, 596]],
  ], [
    [[902, 610], [931, 613], [930, 619], [903, 616]],
    [[930, 613], [958, 616], [956, 623], [930, 619]],
  ]),
  'private-upper': ordinarySeat([
    [[171, 482], [196, 487], [201, 503], [190, 511], [173, 502]],
  ], [
    [[189, 512], [207, 514], [207, 520], [189, 518]],
    [[206, 514], [225, 516], [226, 522], [207, 520]],
  ], [
    // The right-side back shell passes in front of a seated occupant's long
    // hair; keep the left cushion/keyboard side open for hands and knees.
    [[199, 467], [222, 465], [228, 477], [228, 510],
      [219, 523], [201, 519], [195, 504]],
  ]),
  'private-lower': ordinarySeat([
    [[231, 682], [258, 687], [265, 704], [252, 713], [233, 703]],
  ], [
    [[252, 713], [273, 716], [272, 722], [251, 719]],
    [[272, 716], [293, 718], [295, 724], [273, 722]],
  ], [
    [[269, 677], [301, 649], [307, 661], [310, 708],
      [294, 724], [269, 716], [263, 699]],
  ]),
  reception: RECEPTION,
} satisfies Readonly<Record<OfficeWorkstationId, OfficeWorkstationOcclusion>>)

export function getOfficeWorkstationOcclusion(
  workstationId: OfficeWorkstationId,
): OfficeWorkstationOcclusion {
  return OFFICE_WORKSTATION_OCCLUSION[workstationId]
}
