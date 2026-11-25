import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, PackageOpen, X } from 'lucide-react'
import { getPackCard, getPackIdForCard } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { getVisibleGuideCards, LOCAL_PACKS, type LocalCollectionProjection } from '../shared/local-collection-domain.ts'
import { OPENABLE_PACK_SKINS, PACK_REFERENCE_SKINS, type PackSkin } from '../shared/pack-skin-catalog.ts'
import { PackOpeningScene } from './PackOpeningScene.tsx'
import './PackCollectionPreview.css'

type PreviewProps = {
  collection: Pick<LocalCollectionProjection, 'discoveredKeys'>
  initialPackId: string
  onClose(): void
}

const maxSamples = 5
const pouchImage = (skin: PackSkin) => skin.openingArtworkUrl ?? skin.artworkUrl

export function PackCollectionPreview({ collection, initialPackId, onClose }: PreviewProps) {
  const pack = LOCAL_PACKS.find(entry => entry.id === initialPackId) ?? LOCAL_PACKS[0]!
  const samples = getVisibleGuideCards(collection, pack.id)
  const [skin, setSkin] = useState(() => OPENABLE_PACK_SKINS.find(row => row.packId === pack.id) ?? OPENABLE_PACK_SKINS[0]!)
  const [selected, setSelected] = useState<string[]>(() => samples.slice(0, 1).map(card => card.key))
  const [opening, setOpening] = useState(false)
  const [materialId, setMaterialId] = useState('')
  const page = useRef<HTMLElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // A changed account may revoke a sample while this dialog is open.
  const activeKeys = selected.filter(key => samples.some(card => card.key === key))
  const hasEgg = Array.from(collection.discoveredKeys).some(key => {
    const card = getPackCard(key)
    return card && getPackIdForCard(card) === 'egg-channel'
  })
  const materials = PACK_REFERENCE_SKINS.filter(row => row.packId !== 'egg-channel' || hasEgg)
  const material = materials.find(row => row.id === materialId)
  const showingOpening = opening && activeKeys.length > 0

  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    close.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (page.current?.querySelector('.lumaOpeningBackdrop, .lumaSampleLightbox')) return
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const targets = [...page.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary') ?? []]
        .filter(element => element.tagName === 'SUMMARY' || !element.closest('details:not([open])'))
      const first = targets[0], last = targets.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keyboard)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  function toggle(key: string) {
    setSelected(activeKeys.includes(key)
      ? activeKeys.filter(value => value !== key)
      : [...activeKeys, key].slice(0, maxSamples))
  }

  return <section className="lumaSampleDesk" ref={page} role="dialog" aria-modal="true" aria-label="免费试拆">
    <div className="lumaSampleSheet" inert={showingOpening || !!material}>
      <header className="lumaSampleHeader">
        <div><h1>免费试拆</h1><p>{pack.name}</p></div>
        <button type="button" className="lumaSampleClose" ref={close} aria-label="返回卡包店" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="lumaSampleBench">
        <section className="lumaSamplePackaging" aria-label="包装">
          <div className="lumaSamplePouch"><img src={pouchImage(skin)} alt={skin.name} /></div>
          <div className="lumaSampleSwatches" aria-label="选择包装">{OPENABLE_PACK_SKINS.map(row =>
            <button key={row.id} type="button" title={row.name} aria-label={row.name} aria-pressed={skin.id === row.id} onClick={() => setSkin(row)}>
              <img src={pouchImage(row)} alt="" />
            </button>)}</div>
        </section>
        <section className="lumaSamplePicker" aria-label="试拆样卡">
          <div className="lumaSamplePickerTitle"><h2>挑选样卡</h2><span aria-live="polite">已选 {activeKeys.length} / {maxSamples}</span></div>
          <div className="lumaSampleCards">{samples.map(card => {
            const checked = activeKeys.includes(card.key)
            const caption = card.edition === 'errata' ? `错版 · ${card.name}` : card.name
            const label = `${caption} · ${card.versionLabel}`
            return <button key={card.key} type="button" data-edition-key={card.key}
              aria-label={label} aria-pressed={checked} disabled={!checked && activeKeys.length >= maxSamples}
              title={label} onClick={() => toggle(card.key)}>
              <span className="lumaSampleArt"><img src={card.frontUrl} alt="" loading="lazy" />{checked && <i><Check size={12} /></i>}</span>
              <span className="lumaSampleName">{caption}</span>
            </button>
          })}</div>
          <div className="lumaSampleAction"><small>试拆样卡不计入收藏</small>
            <button type="button" disabled={!activeKeys.length} onClick={() => setOpening(true)}><PackageOpen size={17} />开始试拆</button>
          </div>
        </section>
      </div>
      <details className="lumaSampleMaterials">
        <summary>卡背与金属图案<ChevronDown size={16} /></summary>
        <div>{materials.map(row => <button type="button" key={row.id} title={row.name} aria-label={row.name} onClick={() => setMaterialId(row.id)}>
          <img src={row.artworkUrl} alt="" loading="lazy" /><span>{row.name}</span>
        </button>)}</div>
      </details>
    </div>
    {showingOpening && <PackOpeningScene key={activeKeys.join('|')} preview={{ cardKeys: activeKeys, packId: pack.id, skin, returnLabel: '返回试拆台' }} onClose={() => setOpening(false)} />}
    {material && <MaterialView material={material} onClose={() => setMaterialId('')} />}
  </section>
}

function MaterialView({ material, onClose }: { material: PackSkin; onClose(): void }) {
  const close = useRef<HTMLButtonElement>(null)
  const callback = useRef(onClose)
  callback.current = onClose
  useEffect(() => {
    const previous = document.activeElement
    close.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); callback.current() }
      if (event.key === 'Tab') { event.preventDefault(); close.current?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('keydown', keyboard)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  return <div className="lumaSampleLightbox" role="dialog" aria-modal="true" aria-label={material.name}>
    <header><h2>{material.name}</h2><button type="button" ref={close} className="lumaSampleClose" aria-label="关闭原图" onClick={onClose}><X size={20} /></button></header>
    <img src={material.artworkUrl} alt={material.name} />
  </div>
}
