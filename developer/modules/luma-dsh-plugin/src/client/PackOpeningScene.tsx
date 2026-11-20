import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ArrowLeft, Check, RotateCcw, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { getPackCard } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { PremiumCardFinish } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/PremiumCardFinish.tsx'
import { LumaCardViewer } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/LumaCardViewer.tsx'
import { LOCAL_PACKS, type LocalOwnedCard } from '../shared/local-collection-domain.ts'
import { PREVIEW_CARD_CATALOG } from '../shared/preview-card-catalog.ts'
import { OPENABLE_PACK_SKINS, type PackSkin } from '../shared/pack-skin-catalog.ts'
import { getPouchSealBounds, PackOpeningPouch } from './PackOpeningPouch.tsx'
import './PackOpeningScene.css'

type Phase = 'sealed' | 'tearing' | 'emerging' | 'revealed'
type TearDirection = 'ltr' | 'rtl'
type PouchSpace = { width: number; height: number; centerX: number; centerY: number; a: number; b: number; c: number; d: number }
type SealPointer = PouchSpace & {
  id: number; x: number; y: number; left: number; right: number
  direction: TearDirection | null; preferred: TearDirection | null
}
// Measure in the plane of the tilted pouch. A diagonal screen drag along the
// printed seal should cover the same distance on every skin and screen size.
function localPointer(clientX: number, clientY: number, space: PouchSpace) {
  const dx = clientX - space.centerX
  const dy = clientY - space.centerY
  const determinant = space.a * space.d - space.b * space.c || 1
  return {
    x: (space.d * dx - space.c * dy) / determinant + space.width / 2,
    y: (space.a * dy - space.b * dx) / determinant + space.height / 2,
  }
}
const themes: Record<string, string> = { 'dawn-prelude': 'dawn', 'blue-rose-echo': 'rose', 'moon-collection': 'moon', 'first-meeting-journey': 'journey' }
const rarityNames = { N: '初遇', R: '珍藏', SR: '闪耀珍藏', SSR: '星光典藏' }

export type PackOpeningSceneProps = { onClose(): void; onOpenOwned?(): void; invitationFor?(key: string, instanceId: string): { label: string; open(): void } | undefined } & (
  | { cards: readonly LocalOwnedCard[]; preview?: never; historyReplay?: boolean }
  | { cards?: never; preview: { cardKeys: readonly string[]; packId: string; skin?: PackSkin }; historyReplay?: never }
)
/** Saved acquisitions and artwork previews share presentation, never ownership. */
export function PackOpeningScene({ cards, preview, historyReplay, onClose, onOpenOwned, invitationFor }: PackOpeningSceneProps) {
  const [phase, setPhase] = useState<Phase>('sealed')
  const [progress, setProgress] = useState(0)
  const [tearDirection, setTearDirection] = useState<TearDirection>('ltr')
  const [pull, setPull] = useState({ x: 0, y: 0 })
  const [pulling, setPulling] = useState(false)
  const [selected, setSelected] = useState(0)
  const [back, setBack] = useState(false)
  const [flipStatus, setFlipStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const flipRequest = useRef(0)
  const [detail, setDetail] = useState(false)
  const [sound, setSound] = useState(false)
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const dialog = useRef<HTMLElement>(null)
  const tearButton = useRef<HTMLButtonElement>(null)
  const finishButton = useRef<HTMLButtonElement>(null)
  const gallery = useRef<HTMLDivElement>(null)
  const cardButtons = useRef<(HTMLButtonElement | null)[]>([])
  const scrollingTo = useRef<number | null>(null)
  const [gallerySize, setGallerySize] = useState({ width: 1040, height: 350 })
  const pointer = useRef<SealPointer | null>(null)
  const dragged = useRef(false)
  const context = useRef<AudioContext | null>(null)
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose
  const detailRef = useRef(detail); detailRef.current = detail
  const selectionRef = useRef(selected); selectionRef.current = selected
  const rows = preview
    ? preview.cardKeys.slice(0, 5).flatMap((key, index) => { const art = PREVIEW_CARD_CATALOG.find(card => card.key === key); return art ? [{ id: `preview-${index}-${key}`, rarity: art.rarity ?? 'N', art }] : [] })
    : cards.flatMap(owned => { const art = getPackCard(owned.versionKey); return art ? [{ id: owned.id, rarity: owned.rarity, art }] : [] })
  const firstPack = LOCAL_PACKS.find(pack => pack.id === (preview?.packId ?? cards?.[0]?.packId)) ?? LOCAL_PACKS[0]!
  const skin = preview?.skin?.kind === 'pouch' ? preview.skin : OPENABLE_PACK_SKINS.find(row => row.packId === firstPack.id)
  const packImage = skin?.openingArtworkUrl ?? skin?.artworkUrl ?? firstPack.artworkUrl
  const seal = getPouchSealBounds(packImage)
  const packName = preview ? skin?.name ?? firstPack.name : firstPack.name
  const packRatio = skin ? `${skin.width} / ${skin.height}` : '2 / 3'
  const current = rows[selected] ?? rows[0]
  const invitation = !preview && current ? invitationFor?.(current.art.key, current.id) : undefined
  const revealed = phase === 'revealed'
  const emerging = phase === 'emerging' || revealed
  const compact = gallerySize.width < 700
  const gap = compact ? 24 : 18
  const maxHeight = Math.max(150, Math.min(270, gallerySize.height - 92))
  const availableWidth = Math.max(180, gallerySize.width - 64)
  const totalRatio = rows.reduce((sum, row) => sum + row.art.width / row.art.height, 0)
  const displayHeight = compact ? maxHeight : Math.min(maxHeight, (availableWidth - gap * Math.max(0, rows.length - 1)) / Math.max(1, totalRatio))
  const cardWidths = rows.map(({ art }) => Math.min(availableWidth, displayHeight * art.width / art.height))
  const trackWidth = cardWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, rows.length - 1)

  useEffect(() => {
    const element = gallery.current
    if (!element) return
    const measure = () => setGallerySize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [detail])
  useEffect(() => {
    if (detail) return
    const frame = requestAnimationFrame(() => {
      const container = gallery.current, card = cardButtons.current[selectionRef.current]
      if (container && card && container.scrollWidth > container.clientWidth + 2) {
        container.scrollTo?.({ left: Math.max(0, card.offsetLeft - (container.clientWidth - card.offsetWidth) / 2), behavior: 'auto' })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [detail, compact])

  useEffect(() => {
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined
    const change = () => setReduced(!!media?.matches)
    media?.addEventListener?.('change', change)
    return () => media?.removeEventListener?.('change', change)
  }, [])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    tearButton.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (detailRef.current) setDetail(false); else onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const targets = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []]
        .filter(element => !element.closest('[inert]'))
      const first = targets[0], last = targets[targets.length - 1]
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      flipRequest.current++
      document.body.style.overflow = oldOverflow
      document.removeEventListener('keydown', keyboard)
      if (previous?.isConnected) previous.focus()
      else document.querySelector<HTMLButtonElement>('.lumaCollectionHubTabs button[aria-current]')?.focus()
      void context.current?.close()
    }
  }, [])
  useEffect(() => {
    if (phase === 'sealed' || phase === 'revealed') return
    if (reduced) { setPhase('revealed'); return }
    const timer = setTimeout(() => setPhase(phase === 'tearing' ? 'emerging' : 'revealed'), phase === 'tearing' ? 520 : 1450)
    return () => clearTimeout(timer)
  }, [phase, reduced])
  useEffect(() => { if (revealed && !detail) finishButton.current?.focus() }, [revealed, detail])

  function chime() {
    if (!sound) return
    try {
      const audio = context.current ??= new AudioContext()
      void audio.resume().then(() => {
        if (audio.state !== 'running') return
        ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + index * .085
          oscillator.type = 'sine'; oscillator.frequency.value = frequency
          gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .012); gain.gain.exponentialRampToValueAtTime(.0001, start + .65)
          oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .7)
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
        })
      }).catch(() => {})
    } catch { /* Sound is optional; it never blocks the reveal. */ }
  }
  function tear(direction: TearDirection = 'ltr', fromPointer = false) {
    if (phase !== 'sealed') return
    pointer.current = null; setPulling(false); setTearDirection(direction)
    if (!fromPointer) setPull({ x: 0, y: 0 })
    setProgress(1); chime(); setPhase(reduced ? 'revealed' : 'tearing')
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || event.isPrimary === false || pointer.current || phase !== 'sealed') return
    const pouch = event.currentTarget.parentElement!, rect = pouch.getBoundingClientRect()
    const width = pouch.offsetWidth || rect.width || 100, height = pouch.offsetHeight || rect.height || width * 1.5
    const transform = getComputedStyle(pouch).transform
    const matrix = typeof DOMMatrixReadOnly !== 'undefined' && transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : { a: 1, b: 0, c: 0, d: 1 }
    const origin = { width, height, centerX: rect.left + (rect.width || width) / 2, centerY: rect.top + (rect.height || height) / 2, a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d }
    const point = localPointer(event.clientX, event.clientY, origin)
    const left = width * seal.left / 100, right = width * seal.right / 100
    const fraction = (point.x - left) / (right - left)
    const preferred = fraction < .4 ? 'ltr' : fraction > .6 ? 'rtl' : null
    pointer.current = { ...origin, id: event.pointerId, x: point.x, y: point.y, left, right, preferred, direction: null }
    dragged.current = false; setPulling(true); setProgress(0); setPull({ x: 0, y: 0 }); setTearDirection(preferred ?? 'ltr')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function drag(event: PointerEvent<HTMLButtonElement>) {
    const start = pointer.current
    if (!start || start.id !== event.pointerId || phase !== 'sealed') return
    const point = localPointer(event.clientX, event.clientY, start), dx = point.x - start.x, dy = point.y - start.y
    if (Math.hypot(dx, dy) > 6) dragged.current = true
    setPull({ x: dx / start.width, y: dy / start.height })
    if (!start.direction && Math.abs(dx) > 6) start.direction = start.preferred ?? (dx > 0 ? 'ltr' : 'rtl')
    if (!start.direction) return
    setTearDirection(start.direction)
    const sign = start.direction === 'ltr' ? 1 : -1
    const anchor = Math.min(start.right, Math.max(start.left, start.x))
    const distance = start.direction === 'ltr' ? start.right - anchor : anchor - start.left
    const next = Math.max(0, Math.min(1, dx * sign / Math.max(40, distance)))
    setProgress(next)
    if (next >= 1) tear(start.direction, true)
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    if (pointer.current?.id !== event.pointerId) return
    if (!cancelled) {
      drag(event)
      if (!pointer.current) return
    }
    pointer.current = null; setPulling(false); setProgress(0); setPull({ x: 0, y: 0 }); setTearDirection('ltr')
    if (cancelled) dragged.current = true
  }
  function resetFace() {
    flipRequest.current++
    setBack(false)
    setFlipStatus('idle')
  }
  async function flipCard() {
    if (!current?.art.backUrl) return
    const request = ++flipRequest.current
    const nextSide = !back
    const image = new Image()
    setFlipStatus('loading')
    try {
      const src = nextSide ? current.art.backUrl : current.art.frontUrl
      if (typeof image.decode === 'function') {
        image.src = src
        await image.decode()
      } else {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error('Card image unavailable'))
          image.src = src
        })
      }
      if (request !== flipRequest.current) return
      setBack(nextSide)
      setFlipStatus('idle')
    } catch {
      if (request === flipRequest.current) setFlipStatus('failed')
    }
  }
  function select(index: number) {
    setSelected(index); resetFace()
    const container = gallery.current, card = cardButtons.current[index]
    if (container && card && container.scrollWidth > container.clientWidth + 2) {
      scrollingTo.current = index
      container.scrollTo?.({ left: Math.max(0, card.offsetLeft - (container.clientWidth - card.offsetWidth) / 2), behavior: reduced ? 'auto' : 'smooth' })
    }
  }
  function syncGallerySelection() {
    const container = gallery.current
    if (!container || !revealed || container.scrollWidth <= container.clientWidth + 2) return
    const center = container.scrollLeft + container.clientWidth / 2
    let closest = 0, distance = Infinity
    cardButtons.current.forEach((card, index) => {
      if (!card) return
      const next = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center)
      if (next < distance) { distance = next; closest = index }
    })
    if (scrollingTo.current !== null && closest !== scrollingTo.current) return
    scrollingTo.current = null
    if (closest !== selected) { setSelected(closest); resetFace() }
  }
  function replay() {
    setDetail(false); resetFace(); setProgress(0); setPhase('sealed')
    pointer.current = null; dragged.current = false; setPulling(false); setPull({ x: 0, y: 0 }); setTearDirection('ltr')
    scrollingTo.current = null
    requestAnimationFrame(() => tearButton.current?.focus())
  }

  return <div className="lumaOpeningBackdrop">
    <section ref={dialog} className="lumaOpening" role="dialog" aria-modal="true" aria-label={historyReplay ? '开包回放' : '开包结果'}
      data-phase={phase} data-theme={skin?.theme ?? themes[firstPack.id]} data-reduced={reduced} data-count={rows.length} data-preview={!!preview}>
      <header className="lumaOpeningHeader"><span><Sparkles size={15} /> {historyReplay ? '开包回放' : 'LUMA · 一包小小的心动'}</span><div>
        <button type="button" aria-label={sound ? '关闭开包音效' : '开启开包音效'} aria-pressed={sound} onClick={() => setSound(value => !value)}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <button type="button" aria-label="关闭开包结果" onClick={onClose}><X size={20} /></button></div></header>
      {detail && current ? <div className="lumaOpeningDetail"><button type="button" className="lumaOpeningBack" autoFocus onClick={() => setDetail(false)}><ArrowLeft size={16} /> 返回开包结果</button><LumaCardViewer card={current.art} onClose={() => setDetail(false)} /></div>
        : <>
          <div className="lumaOpeningTitle"><span className="lumaOpeningEyebrow">{revealed ? 'A LITTLE JOY, JUST FOR YOU' : 'SOMETHING LOVELY IS INSIDE'}</span>
            <h2>{revealed ? rows.length > 1 ? '喜欢的相遇，一起到来' : '是为你而来的小小惊喜' : '今天的心动，藏在这里'}</h2>
            <p aria-live="polite">{revealed ? preview ? `正在欣赏 ${rows.length} 张原始卡面 · 素材预览` : `这 ${rows.length} 张卡片已收入我的卡册` : phase === 'sealed' ? '从左向右轻拉封口，也可从右侧反向拆开' : phase === 'tearing' ? '拆开一点点，快乐多一点点…' : '让这一刻，闪闪发光'}</p>
          </div>
          <div className="lumaOpeningStage">
            <div ref={gallery} className="lumaOpeningCards" inert={!revealed} onScroll={syncGallerySelection} onPointerDown={() => { scrollingTo.current = null }}>
              <div className="lumaOpeningCardTrack" style={{ '--card-gap': `${gap}px` } as CSSProperties}>
              {rows.map(({ id, rarity, art }, index) => {
                const ratio = art.width / art.height
                const width = cardWidths[index]!
                const height = width / ratio
                const isBack = back && selected === index && !!art.backUrl
                const precedingWidth = cardWidths.slice(0, index).reduce((sum, value) => sum + value, 0) + gap * index
                const startOffset = compact ? 0 : trackWidth / 2 - precedingWidth - width / 2
                const style = { '--card-i': index, '--emerge-x': `${startOffset}px`, '--card-width': `${width}px`, '--card-height': `${height}px`, '--frame-height': `${compact ? maxHeight : displayHeight}px`, '--slot-width': `${compact ? availableWidth : width}px` } as CSSProperties
                return <button ref={element => { cardButtons.current[index] = element }} key={id} type="button" style={style} data-orientation={art.width > art.height ? 'landscape' : 'portrait'} data-side={isBack ? 'back' : 'front'} className={`lumaOpeningCard${selected === index ? ' is-selected' : ''}${isBack ? ' is-back' : ''}`}
                  aria-label={`查看卡片 ${index + 1}：${art.name}，${preview && !art.rarity ? '原作预览' : rarity}`} aria-pressed={selected === index}
                  onClick={() => select(index)} onKeyDown={event => {
                    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                    event.preventDefault()
                    const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))
                    select(next); cardButtons.current[next]?.focus({ preventScroll: true })
                  }} onPointerMove={event => {
                    if (reduced || !revealed) return
                    const bounds = event.currentTarget.getBoundingClientRect()
                    event.currentTarget.style.setProperty('--shine-x', `${(event.clientX - bounds.left) / bounds.width * 100}%`)
                  }}>
                  <span className="lumaOpeningCardFrame"><span className="lumaOpeningCardBody"><span className={`lumaOpeningCardFace ${isBack ? 'is-back' : 'is-front'}`}><img src={isBack ? art.backUrl : art.frontUrl} alt={isBack ? `${art.name}卡背` : art.alt} draggable={false} />{!isBack && <><PremiumCardFinish card={art} active={emerging} reduced={reduced} /><span className="lumaOpeningCardSheen" /></>}</span></span></span>
                  <span className="lumaOpeningCardCaption"><b>{preview && !art.rarity ? '原作' : rarity}</b>{art.character}</span>
                </button>
              })}
              </div>
            </div>
            <div className="lumaOpeningPouch" style={{ '--pack-ratio': packRatio, '--seal-left': `${seal.left}%`, '--seal-right': `${100 - seal.right}%`, '--seal-center': `${(seal.top + seal.seam) / 2}%` } as CSSProperties} aria-hidden={emerging}>
              <PackOpeningPouch src={packImage} alt={`${packName}卡包完整外观`} phase={phase} progress={progress} direction={tearDirection} pull={pull} active={pulling} />
              {phase === 'sealed' && <button ref={tearButton} className="lumaOpeningTear" type="button" aria-label="沿封口拆开" onClick={event => { if (event.detail !== 0 && dragged.current) { dragged.current = false; return } tear() }}
                onPointerDown={startDrag} onPointerMove={drag} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)} />}
            </div>
            {emerging && !reduced && <div className="lumaOpeningConfetti" aria-hidden="true">{Array.from({ length: 38 }, (_, index) => <i key={index} style={{ '--i': index, '--dx': `${Math.sin(index * 2.4) * (180 + index * 6)}px`, '--dy': `${-80 - (index * 47) % 310}px`, '--dr': `${index * 83}deg`, '--confetti-color': ['#d5a8bc', '#c7bcdf', '#a9c9be', '#e8c784', '#a6c6dc'][index % 5] } as CSSProperties} />)}</div>}
          </div>
          <footer className="lumaOpeningFooter">
            {revealed && rows.length > 1 && <p className="lumaOpeningBrowseHint">{compact ? '左右滑动，或点编号欣赏完整卡片' : '每一张都完整展开 · 选中后可细看'}</p>}
            {revealed && rows.length > 1 && <nav className="lumaOpeningCardPicker" aria-label="选择揭晓的卡片">{rows.map(({ art, id }, index) => <button key={id} type="button" aria-label={`选择第 ${index + 1} 张：${art.name}`} aria-pressed={selected === index} onClick={() => select(index)}>{index + 1}</button>)}</nav>}
            {revealed && current ? <><div className="lumaOpeningCardInfo"><span className={`lumaOpeningRarity rarity-${current.rarity}`}>{preview && !current.art.rarity ? '原作素材预览' : `${current.rarity} · ${rarityNames[current.rarity]}`}</span><h3>{current.art.name}</h3><p>{current.art.character} · {current.art.versionLabel}{current.art.edition === 'errata' ? ' · 错版' : ''}</p></div>
              <div className="lumaOpeningTools"><button type="button" disabled={!current.art.backUrl || flipStatus === 'loading'} aria-busy={flipStatus === 'loading'} onClick={() => void flipCard()}><RotateCcw size={14} />{flipStatus === 'failed' ? '重试翻面' : flipStatus === 'loading' ? '正在翻面…' : back ? '看看正面' : '翻到背面'}</button><button type="button" onClick={() => setDetail(true)}><Sparkles size={14} />细看卡片与工艺</button><button type="button" onClick={replay}>再看一次</button></div>
              <div className="lumaOpeningActions">{invitation && <button type="button" onClick={invitation.open}>{invitation.label}</button>}{!preview && onOpenOwned && <button type="button" onClick={onOpenOwned}>查看我的持有</button>}<button ref={finishButton} type="button" className="lumaOpeningPrimary" onClick={onClose}><Check size={16} />{preview ? '返回素材册' : historyReplay ? '返回收支记录' : '收好这次相遇'}</button></div>
            </> : <><span className="lumaOpeningHint">{preview ? `${packName} · ${rows.length} 张卡面预览 · 不计入持有` : rows.length > 1 ? `${rows.length} 包 · 每包一张 · 一起揭晓` : packName + ' · 一包一张小小惊喜'}</span><button type="button" className="lumaOpeningSkip" onClick={() => setPhase('revealed')}>跳过动画</button></>}
          </footer>
        </>}
    </section>
  </div>
}
