import masks from './sceneChairMattes.generated.json'

type Matte = { path:string; sha256:string }
const bySource:Readonly<Record<string,Matte>> = masks
const layers = new WeakMap<ImageBitmap,{matte:ImageBitmap;canvas:HTMLCanvasElement}>()

/** Keep the room's illustrated chair when a rear-facing whole sprite contains its own office chair. */
export function seatMatte(binding:{sourceSha256:string; integratedChair?:unknown;actorFurnitureOwnership?:{sourceHasChair:boolean}}) {
  if(binding.integratedChair || binding.actorFurnitureOwnership?.sourceHasChair===false)return undefined
  return bySource[binding.sourceSha256]
}

export function seatedBodyLayer(original:ImageBitmap, matte:ImageBitmap | undefined):HTMLCanvasElement | undefined {
  if(!matte)return undefined
  const cached=layers.get(original)
  if(cached?.matte===matte)return cached.canvas
  if(matte.width!==original.width || matte.height!==original.height)throw Error('角色坐姿分层与原始图集尺寸不匹配。')
  const canvas=document.createElement('canvas')
  canvas.width=original.width;canvas.height=original.height
  const context=canvas.getContext('2d')
  if(!context)throw Error('当前设备无法绘制角色坐姿。')
  context.drawImage(original,0,0)
  context.globalCompositeOperation='destination-in'
  context.drawImage(matte,0,0)
  layers.set(original,{matte,canvas})
  return canvas
}
