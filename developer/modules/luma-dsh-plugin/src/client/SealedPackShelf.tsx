import { useState } from 'react'
import { ArrowUpRight, Layers3, PackageOpen, ShoppingBag } from 'lucide-react'
import { LOCAL_PACKS, type LocalOwnedPack } from '../shared/local-collection-domain.ts'
import './SealedPackShelf.css'

interface Props {
  packs: readonly LocalOwnedPack[]
  disabled: boolean
  onOpen(ids: readonly string[]): void
  onShop(): void
}
const date = (at:number) => new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(at)

export function SealedPackShelf({packs, disabled, onOpen, onShop}: Props) {
  const [chosen, setChosen] = useState<string>()
  const inventory = LOCAL_PACKS.map(pack => ({pack, copies:packs.filter(item => item.packId === pack.id)}))
    .filter(row => row.copies.length)
  const focus = inventory.find(row => row.pack.id === chosen) ?? inventory.find(row => row.pack.id === packs.at(-1)?.packId)
  const pack = focus?.pack ?? LOCAL_PACKS[0]!
  const copies = focus?.copies ?? []
  const first = copies[0]
  return <section className="lumaPouchStudio" data-pack={pack.id} aria-label="未开封卡包">
    {inventory.length>1 && <nav className="lumaPouchShelfIndex" aria-label="切换库存包装">{inventory.map(({pack:item,copies:stock})=><button key={item.id} type="button"
      disabled={disabled} aria-pressed={item.id===pack.id} onClick={()=>setChosen(item.id)} aria-label={item.name+'，库存 '+stock.length+' 包'}>
      <img src={item.artworkUrl} alt="" loading="lazy"/><span>{item.name}<small>{stock.length} 包</small></span>
    </button>)}</nav>}
    <div className="lumaPouchExhibit">
      <div className="lumaPouchPlinth" aria-hidden="true"/>
      <img key={pack.id} src={pack.artworkUrl} alt={focus ? pack.name+'实物包装' : pack.name+'卡包店包装预览'} decoding="async"/>
    </div>
    <div className="lumaPouchDesk">
      <div className="lumaPouchCount"><Layers3 size={15} aria-hidden="true"/>{focus ? '未开封库存 · '+packs.length+' 包' : '未开封库存 · 0 包'}</div>
      <h2>{focus ? pack.name : '还没有未开封卡包'}</h2>
      <p>{focus ? (pack.id === 'first-meeting-journey' ? '吉米「折光未来」包装。' : '')+pack.description : '在卡包店挑一个喜欢的包装，买下后就可以在这里拆开。'}</p>
      {first ? <>
        <dl><div><dt>此款库存</dt><dd>{copies.length}<small>包</small></dd></div><div><dt>每包收录</dt><dd>1<small>张</small></dd></div></dl>
        <div className="lumaPouchActions"><button type="button" className="lumaPouchOpen" disabled={disabled} onClick={() => onOpen([first.id])}><PackageOpen size={18} aria-hidden="true"/>开启卡包</button>
          {packs.length>1 && <button type="button" disabled={disabled} onClick={()=>onOpen(packs.slice(0,5).map(item=>item.id))}>一起拆开 · {Math.min(5,packs.length)} 包</button>}</div>
        <small className="lumaPouchFootnote">{inventory.length>1 ? '批量拆封按购买顺序从全部库存取包。' : '购入于 '+date(first.purchasedAt)}</small>
      </> : <button className="lumaPouchOpen" type="button" onClick={onShop}><ShoppingBag size={16} aria-hidden="true"/>去选一包 <ArrowUpRight size={15} aria-hidden="true"/></button>}
    </div>
  </section>
}
