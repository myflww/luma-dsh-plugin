import { OFFICE_WORKSTATION_IDS, isOfficeWorkstationId } from '../../office-workflow/shared/office-workstations.ts'

type Point = readonly [number,number]
// The inner portion of a key row on the shipped 1672 × 941 daylight plate.
// Centre and half-vector are in scene pixels. Columns follow OFFICE_WORKSTATION_IDS.
// The rear of a reception monitor hides the keys from this camera.
type KeyRow = readonly [x:number,y:number,halfX:number,halfY:number]
const rows: Readonly<Record<string,readonly (KeyRow|null)[]>> = {
  classic: [
    [806,340,12,-1],[926,348,12,3],[1041,385,11,5],[672,540,12,-1],[796,539,12,1],[926,556,12,4],
    [162,465,8,-5],[234,656,9,-7],null,
  ],
  'office.claude.v1': [
    [502,279,12,2],[597,295,12,2],[689,311,12,3],[396,556,14,-5],[506,523,14,-5],[614,494,14,-4],
    [1004,449,14,4],[1118,471,14,3],[1239,496,13,4],
  ],
  'office.longmama.v1': [
    [693,301,10,-2],[835,291,10,0],[975,301,10,2],[197,317,12,-4],[1470,316,11,3],[360,423,12,4],
    [469,520,14,4],[1308,423,12,-5],[1200,521,15,-5],
  ],
  'office.gemini.v1': [
    [617,274,9,-3],[1050,274,9,3],[557,423,10,-6],[643,390,10,-4],[1026,389,10,4],[1111,422,12,5],
    [693,592,13,5],[835,615,15,0],[977,592,13,-5],
  ],
  'office.grok.v1': [
    [409,408,13,3],[514,428,14,2],[631,436,13,0],[1051,437,13,-1],[1167,427,13,-2],[1273,410,13,-3],
    [692,589,15,2],[833,596,15,0],[971,590,15,-2],
  ],
  'office.jingyuniang.v1': [
    [750,280,9,0],[916,280,9,0],[364,525,10,-5],[475,481,11,-4],[771,410,11,3],[879,454,10,4],
    // At the near counter the palms are behind the monitor's opaque back.
    [1216,476,12,4],[1325,525,12,5],[397,622,8,0],
  ],
}

/** Select the painted keys nearest a seated actor's reach without shifting desk artwork. */
export function officeKeyboardCenter(theme:string,station:string):Point|undefined {
  if(!isOfficeWorkstationId(station))return undefined
  const row=rows[theme]?.[OFFICE_WORKSTATION_IDS.indexOf(station)]
  return row?[row[0],row[1]]:undefined
}

export function officeKeyboardContact(theme:string,station:string,preferred:Point):Point|undefined {
  if(!isOfficeWorkstationId(station))return undefined
  const row=rows[theme]?.[OFFICE_WORKSTATION_IDS.indexOf(station)]
  if(!row)return undefined
  const [x,y,dx,dy]=row
  const ratio=Math.max(-1,Math.min(1,((preferred[0]-x)*dx+(preferred[1]-y)*dy)/(dx*dx+dy*dy)))
  return [x+ratio*dx,y+ratio*dy]
}

// Midpoint of the visible fingertips on frame zero of each 512 × 860 rear strip.
export const officeRearHands: Readonly<Record<string,Point>> = {
  '54f701a3a0a245b558f4cf8a33f3b16ff2389ffd5ae633af46565b7cbc9b5cb6': [253, 509], // bai-shuangming
  '91b680686e7da34b1231179275a2f5cf6dc0a7fdda0ddb147114a1ba4f42e29e': [249, 561], // skin.bai-shuangming.v1
  '613ce89a32070e604940dd175c4716f02d9d1ff1d0cd3bd647fe6c776afee970': [231, 462], // claude
  '783f5980c465745eea4a10d88d180d628acd23ff76fa33e57965fa092ac0301b': [274, 601], // skin.claude.v1
  '5672f2154cd47b4ce190260e241278722f2ddde0086645b2227f2b2e2f4a03a8': [265, 547], // gemini
  'e86241962e3ae1707ccd4414aba8d4ea9f451bbebd1f98f26a7823d80f72e99a': [266, 549], // grok
  '6de0fda03a227f5f550db3c38c0c1b2fe7bc4f29452e984532887b9ce7619080': [248, 541], // jingyuniang
  '4655690f2405c6528acf7ee9c3e5a42802064f656ef7e9cfac61c7929c1e9342': [238, 544], // skin.jingyuniang.v1
  '6d5cbfd16381482028f169b6ecb6cdb60ec1ab19e054f560cbbdef33d86573f2': [269, 645], // longmama
  '0c8993f517a1d2fcc060b378a4617530ec2f4b957948678848f9363297796970': [279, 643], // skin.longmama.v1
  '2ea41b62b3d8f6257ff6cb643710bacd34cb4e59375d7767a13de81b361038d2': [261, 364], // lu-mi
  '0bcd599c420fb38efa4c8b40afa91504f8bf3d9d9f81bddaa804199eb521b843': [284, 381], // skin.lu-mi.v1
  '2e164d0a28021583aa1c7280851ba1dd8fe1d43993a769508d406a76c1fab41c': [246, 404], // shan
  'e69be089989e30cbd6ea921a87de4a7e436895709a29bce7f962bd98bcc489dd': [274, 470], // skin.shan.v1
}
