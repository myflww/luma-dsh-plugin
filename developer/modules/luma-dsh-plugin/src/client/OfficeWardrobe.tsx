import { OFFICE_OUTFIT_CHOICES } from './office-theme-catalog.ts'
import { EmployeeFigure, type ResidentId } from './OfficeBedroom.tsx'
import { Check, Shirt } from 'lucide-react'

export function OfficeWardrobe({ id, selected, disabled, unlockedEmployeeIds, onSelect, onEquip, onClose }: {
  id: ResidentId; selected: string | undefined; disabled: boolean
  unlockedEmployeeIds: readonly string[]
  onSelect:(id:ResidentId)=>void; onEquip:(skin:string|null)=>void; onClose?:()=>void
}) {
  const owner = OFFICE_OUTFIT_CHOICES.find(choice=>choice.employeeId===id)!
  const current = selected ?? owner.defaultSkinId
  const choices = [
    ...owner.defaultSkinId ? [] : [{skin:undefined, title:'原始衣装'}],
    {skin:owner.skinId, title:owner.skinName},
  ]
  return <section className="lumaOfficePanel" aria-label="员工衣橱">
    <div className="lumaOfficePanelTitle"><h2>员工衣橱</h2>
      <label>员工 <select aria-label="衣橱员工" value={id} onChange={e=>onSelect(e.target.value as ResidentId)}>
        {OFFICE_OUTFIT_CHOICES.filter(choice=>unlockedEmployeeIds.includes(choice.employeeId)).map(choice=><option key={choice.employeeId} value={choice.employeeId}>{choice.name}</option>)}
      </select></label>
      {onClose && <button type="button" onClick={onClose}>收起衣橱</button>}
    </div>
    <div className="lumaFittingRoom">
      <figure><EmployeeFigure id={id} skinId={current}/><figcaption>{owner.name}</figcaption></figure>
      <div className="lumaFittingChoices">{choices.map(item=><button type="button" key={item.skin ?? 'original'}
      aria-label={owner.name+' · '+item.title} aria-pressed={current===item.skin}
      disabled={disabled || current===item.skin || Boolean(item.skin && !owner.available)} onClick={()=>onEquip(item.skin ?? null)}>
      {current===item.skin?<Check size={16} aria-hidden="true"/>:<Shirt size={16} aria-hidden="true"/>}
      <span><strong>{item.title}</strong><small>{current===item.skin?'已穿戴':item.skin && !owner.available?'暂不可用':'换上'}</small></span>
    </button>)}</div></div>
  </section>
}
