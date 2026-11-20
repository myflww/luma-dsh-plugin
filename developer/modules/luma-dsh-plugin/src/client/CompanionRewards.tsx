import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getCardCollectionKey, getPackCard } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { canRedeemCard, characterIdForCard, COMPANION_REWARDS, LOCAL_PACKS, STARTER_EMPLOYEE_ID, type CharacterId } from '../shared/local-collection-domain.ts'
import type { LocalCollectionRuntime } from './local-collection-store.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { MessageAvatar } from './MessageAvatar.tsx'
import './CompanionRewards.css'

export function CompanionRewards({ runtime, onFindPack, invitation }: { runtime: LocalCollectionRuntime; onFindPack(id: string): void; invitation?: { employeeId: CharacterId; instanceId: string } | undefined }) {
  const state = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot, runtime.store.getSnapshot)
  const [selected, setSelected] = useState(invitation)
  const invitationForm = useRef<HTMLSelectElement>(null)
  useEffect(() => { if (invitation) invitationForm.current?.focus() }, [invitation])
  const [notice, setNotice] = useState('')
  const held = new Set(state.cards.map(card => getCardCollectionKey(card.versionKey)))
  const disabled = !state.writable || state.pending
  const confirm = async () => {
    if (!selected || disabled) return
    const result = await runtime.store.redeemEmployee(selected.employeeId, selected.instanceId)
    if (result.status === 'saved') {
      setNotice(`${COMPANION_REWARDS.find(row => row.id === selected.employeeId)!.name}已入职，可以在「联系」里打声招呼。`)
      setSelected(undefined)
    } else if (result.status === 'rejected') setNotice(result.message)
  }
  return <section className="lumaRewards" aria-label="伙伴与空间">
    <header><div><h2>伙伴与空间</h2><p>选一张对应的兑换卡邀请伙伴。持有同一伙伴的全部正版卡面，即可获得专属办公室和卧室。</p></div><strong>{state.unlockedEmployeeIds.length} / {COMPANION_REWARDS.length} 位已入职</strong></header>
    {notice && <p role="status">{notice}</p>}
    <div className="lumaRewardsGrid">{[...COMPANION_REWARDS].sort((a, b) => Number(b.id === STARTER_EMPLOYEE_ID) - Number(a.id === STARTER_EMPLOYEE_ID)).map(reward => {
      const joined = state.unlockedEmployeeIds.includes(reward.id), themed = state.unlockedThemeIds.includes(reward.office)
      const cards = state.cards.filter(card => characterIdForCard(card.versionKey) === reward.id && canRedeemCard(card.versionKey))
        .sort((a, b) => (state.ownedCounts[b.versionKey] ?? 0) - (state.ownedCounts[a.versionKey] ?? 0))
      const chosen = selected?.employeeId === reward.id && cards.find(card => card.id === selected.instanceId)
      const obtained = reward.targets.filter(card => held.has(card.key)).length
      const pack = LOCAL_PACKS.find(item => item.id === reward.packId)!
      return <article key={reward.id} aria-label={reward.name}>
        <div className="lumaRewardIdentity"><MessageAvatar {...getChibiAvatar(reward.id)} /><div><h3>{reward.name}</h3><small>{reward.id === STARTER_EMPLOYEE_ID ? '初始伙伴' : joined ? '已入职' : cards.length ? '可邀请入职' : '待相遇'}</small></div></div>
        <div className="lumaRewardTheme"><strong>专属办公室与卧室</strong><span>{themed ? '已解锁' : `${obtained} / ${reward.targets.length} 款`}</span></div>
        <progress aria-label={reward.name + '空间收集进度'} value={themed ? reward.targets.length : obtained} max={reward.targets.length || 1} />
        <details><summary>查看卡片条件</summary>
          {reward.id !== STARTER_EMPLOYEE_ID && <p>以下任一版本可邀请入职</p>}
          {reward.id !== STARTER_EMPLOYEE_ID && <ul>{reward.invitations.map(card => <li key={card.key}>{card.name} · {card.versionLabel}</li>)}</ul>}
          <p>空间所需正版 {obtained} / {reward.targets.length}</p><ul>{reward.targets.map(card => <li key={card.key}>{held.has(card.key) ? '已持有' : '未持有'} · {card.name} · {card.versionLabel}</li>)}</ul>
        </details>
        {chosen && <div className="lumaRewardConfirm">
          <label>选择消耗的卡片<select ref={invitationForm} value={chosen.id} onChange={event => setSelected({ employeeId: reward.id, instanceId: event.target.value })}>{cards.map(card => {
            const edition = getPackCard(card.versionKey)!
            return <option key={card.id} value={card.id}>{edition.name} · {edition.versionLabel} · {card.id.slice(-8)}</option>
          })}</select></label>
          <p>确认后会消耗这 1 张卡，永久邀请{reward.name}。当前持有同版 {state.ownedCounts[chosen.versionKey]} 张。</p>
          <div><button type="button" disabled={disabled} onClick={() => void confirm()}>确认兑换入职</button><button type="button" disabled={state.pending} onClick={() => setSelected(undefined)}>取消</button></div>
        </div>}
        {!chosen && <footer>{!joined && cards.length > 0 && <button className="lumaRewardInvite" type="button" disabled={disabled} onClick={() => { setNotice(''); setSelected({ employeeId: reward.id, instanceId: cards[0]!.id }) }}>选择兑换卡</button>}
          {(!joined || !themed) && <button type="button" onClick={() => onFindPack(pack.id)}>查看{pack.name}卡包</button>}
        </footer>}
      </article>
    })}</div>
  </section>
}
