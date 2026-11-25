import { useContactDirectory } from './ContactDirectory.tsx'
import { ArrowUpRight, Check } from 'lucide-react'
import { useState } from 'react'
import { getOfficeWorldAssetForPhase } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timeSceneAssets.ts'
import { OFFICE_THEME_CHOICES } from './office-theme-catalog.ts'
import { BEDROOM_ART, CLASSIC_BEDROOM_ART, SHOP_BEDROOM_ART } from './bedroom-art.generated.ts'
import { SHOP_BEDROOMS, type ShopBedroom } from '../shared/shop-bedrooms.ts'
import { ShopBedroomPreview } from './ShopBedroomPreview.tsx'
import { COMPANION_REWARDS } from '../shared/local-collection-domain.ts'
import type { OfficePresentationSelection } from '../office-presentation-settings.ts'
import './RoomThemePicker.css'

const officeFinishes = OFFICE_THEME_CHOICES.map(theme => ({
  id: theme.id, name: theme.name, image: getOfficeWorldAssetForPhase('noon', undefined, theme.id ?? undefined),
}))
const bedroomFinishes = [
  {id:null, name:'经典卧室', image:CLASSIC_BEDROOM_ART.day},
  ...COMPANION_REWARDS.map(reward => ({id:reward.bedroom, name:reward.name+'主题', image:BEDROOM_ART[reward.id].day})),
]
type Props = {
  space: 'office' | 'bedroom'
  selected: string | null
  resident: string
  bedrooms: NonNullable<OfficePresentationSelection['bedroomThemes']>
  unlocked: readonly string[]
  disabled: boolean
  onEquip(id: string | null): void
  onProgress?: () => void
  onShop?: (()=>void) | undefined
}
export function RoomThemePicker({space, selected, resident, bedrooms, unlocked, disabled, onEquip, onProgress, onShop}: Props) {
  const {names}=useContactDirectory()
  const room = space === 'office' ? '办公室' : '卧室'
  const [preview,setPreview]=useState<ShopBedroom|null>(null)
  const owned = (space === 'office' ? officeFinishes : bedroomFinishes).filter(item => item.image && (item.id === null || unlocked.includes(item.id)))
  return <section className="lumaRoomGallery" aria-label={room+'主题'}>
    <header><h2>{room}换肤</h2><p>可用主题 <strong>{owned.length+(space==='bedroom'?SHOP_BEDROOMS.filter(item=>unlocked.includes(item.id)).length:0)}</strong></p></header>
    <ul>{owned.map(theme => {
      const equipped = selected === theme.id
      const source = space === 'bedroom' && theme.id ? Object.entries(bedrooms).find(([id, value]) => id !== resident && value === theme.id)?.[0] : undefined
      const owner = source && COMPANION_REWARDS.find(reward => reward.id === source)
      return <li key={theme.id ?? 'classic'}><button type="button" aria-pressed={equipped} aria-label={theme.name}
        disabled={disabled || equipped} onClick={() => onEquip(theme.id)}>
        <img src={theme.image} alt="" loading="lazy" decoding="async"/>
        <span className="lumaRoomGalleryCaption"><strong>{theme.name}</strong><small>{equipped ? '使用中' : owner ? '从'+(names[owner.id] ?? owner.name)+'的卧室移入' : theme.id === null ? '基础布置' : '已解锁'}</small></span>
        {equipped && <span className="lumaRoomGalleryTick" aria-hidden="true"><Check size={12}/></span>}
      </button></li>
    })}</ul>
    {onProgress && <button className="lumaRoomGalleryProgress" type="button" onClick={onProgress}>查看主题解锁进度 <ArrowUpRight size={14} aria-hidden="true"/></button>}
    {space==='bedroom' && <section className="lumaShopRoomOptions" aria-label="通用卧室皮肤">
      <header><h3>通用卧室皮肤</h3>{onShop && <button type="button" className="lumaRoomGalleryProgress" onClick={onShop}>前往商店 <ArrowUpRight size={14}/></button>}</header>
      <div>{SHOP_BEDROOMS.map(item=>{
        const have=unlocked.includes(item.id),equipped=selected===item.id
        return <article key={item.id}><button type="button" className="lumaShopRoomThumb" aria-label={'预览'+item.name} onClick={()=>setPreview(item)}>
          <img src={SHOP_BEDROOM_ART[item.id].day} alt="" loading="lazy"/><span>预览</span></button>
          {have?<button type="button" className="lumaShopRoomEquip" data-bedroom-equip={item.id} aria-label={item.name} aria-pressed={equipped}
            disabled={disabled || equipped} onClick={()=>onEquip(item.id)}><strong>{item.name}</strong><small>{equipped?'使用中':'使用'}</small></button>
          :<div className="lumaShopRoomPrice"><strong>{item.name}</strong><small>{item.price} 星币</small></div>}</article>
      })}</div>
      {preview && <ShopBedroomPreview room={preview} onClose={()=>setPreview(null)}/>}
    </section>}
  </section>
}
