import { useMemo, useState } from 'react'
import { ArrowUpRight, Check, LockKeyhole, Search } from 'lucide-react'
import { getPackPool } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { LOCAL_PACKS, type LocalCollectionProjection } from '../shared/local-collection-domain.ts'

export function PackFieldGuide({collection, onOpenShop}: {collection: LocalCollectionProjection; onOpenShop(id:string):void}) {
  const [chosen,setChosen] = useState(LOCAL_PACKS[0]!.id)
  const [search,setSearch] = useState('')
  const [visible,setVisible] = useState(24)
  const pack = LOCAL_PACKS.find(item => item.id === chosen)!
  const pool = getPackPool(pack.id)
  const discovered = useMemo(() => new Set(collection.openedCards.map(card => card.versionKey)),[collection.openedCards])
  const query = search.trim().toLocaleLowerCase()
  const matching = pool.filter(card => (card.name+' '+card.character+' '+card.versionLabel+' '+card.rarity).toLocaleLowerCase().includes(query))
  return <section className="lumaGuide" aria-label="卡池图鉴">
    <header><h2>卡池图鉴</h2><p>按卡包查看可抽版本。首次开出的卡会点亮图鉴，兑换入职后也会留下相遇记录。</p></header>
    <nav className="lumaGuideVolumes" aria-label="选择卡池">{LOCAL_PACKS.map(item => <button type="button" key={item.id} aria-pressed={item.id===chosen} onClick={() => {setChosen(item.id);setVisible(24);setSearch('')}}>
      <img src={item.artworkUrl} alt=""/><span>{item.name}<small>{getPackPool(item.id).filter(card=>discovered.has(card.key)).length} / {getPackPool(item.id).length} 已点亮</small></span>
    </button>)}</nav>
    <div className="lumaGuideFilter"><label><Search size={16}/><input type="search" aria-label="搜索卡池版本" placeholder="搜索名称、角色或品质" value={search} onChange={event=>{setSearch(event.target.value);setVisible(24)}}/></label>
      <button type="button" onClick={()=>onOpenShop(pack.id)}>前往{pack.name} <ArrowUpRight size={15}/></button></div>
    <ul className="lumaGuideSlots">{matching.slice(0,visible).map(card=>{
      const lit=discovered.has(card.key)
      const copies=collection.ownedCounts[card.key] ?? 0
      return <li key={card.key} data-discovered={lit}>
        <div className="lumaGuideStamp">{lit ? <img src={card.frontUrl} alt={card.name} loading="lazy" decoding="async"/> : <LockKeyhole size={22} strokeWidth={1.4}/>}</div>
        <div><small>{card.rarity} · {card.character}</small><strong>{card.name}</strong><span>{card.versionLabel}</span>
        <em>{lit ? <><Check size={12}/>{copies ? '持有 '+copies+' 张' : '已点亮 · 已兑换'}</> : '未获得'}</em></div>
      </li>
    })}</ul>
    {!matching.length && <p role="status">这个卡池里没有符合条件的版本。</p>}
    {matching.length > visible && <button className="lumaGuideMore" type="button" onClick={()=>setVisible(visible+24)}>查看更多版本（还有 {matching.length-visible} 个）</button>}
  </section>
}
