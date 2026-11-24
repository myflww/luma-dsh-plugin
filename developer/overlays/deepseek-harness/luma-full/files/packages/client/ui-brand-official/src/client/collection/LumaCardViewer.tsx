import { LumaHelpTip } from '../LumaHelpTip.tsx'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { CardEditionDefinition } from './cardLibraryTypes.ts'
import { PRODUCTION_CARD_CATALOG } from './productionCardCatalog.ts'
import { resolveCardPresentation } from './cardPresentation.ts'
import { PremiumCardFinish } from './PremiumCardFinish.tsx'
import { needsPremiumCardFallback, resolvePremiumCardFinish } from './premiumCardFinishDesign.ts'
import { PackBackSurface } from './PackBackSurface.tsx'
import { DEFAULT_PACK_LIGHTING, normalizePackLighting, packBackFamilyForCard, type PackLighting } from './packBackMaterial.js'
import './LumaCardViewer.css'

type Command = 'front' | 'back' | 'edge' | 'reset' | 'left' | 'right' | 'reduced'
function trustedViewer(card: CardEditionDefinition) {
  if (!/^[A-Z0-9-]+$/.test(card.workId) || !/^[a-zA-Z0-9._-]+$/.test(card.revision)) return null
  const exact = `/luma-card-viewers/${card.workId}/${card.revision}/index.html?embed=1`
  return card.viewerUrl === exact ? exact : null
}

/** One selected card only. Authored layers opt into depth; ordinary editions keep the thin-card view. */
export function LumaCardViewer({ card: sourceCard, onClose }: { card: CardEditionDefinition; onClose?(): void; sourcePackId?: string | null | undefined }) {
  const card = resolveCardPresentation(sourceCard, PRODUCTION_CARD_CATALOG)
  const frameFinish = resolvePremiumCardFinish(card)
  const viewerUrl = trustedViewer(card)
  const [mode, setMode] = useState<'interactive' | 'static'>('interactive')
  const [failed, setFailed] = useState(false)
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
  const [imageAttempt, setImageAttempt] = useState(0)
  const [loadedLayers, setLoadedLayers] = useState<Record<string, boolean>>({})
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [angle, setAngle] = useState({ x: 0, y: 0 })
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [size, setSize] = useState({ width: 280, height: 420 })
  const [lighting, setLighting] = useState<PackLighting>(() => normalizePackLighting(DEFAULT_PACK_LIGHTING))
  const [materialAvailable, setMaterialAvailable] = useState<boolean | null>(null)
  const close = useRef(onClose)
  close.current = onClose
  const frame = useRef<HTMLIFrameElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null)
  const live = mode === 'interactive' && !!viewerUrl && !failed && !needsPremiumCardFallback(card)
  const ready = readyKey === card.key
  const packId = packBackFamilyForCard(card)
  const materialBack = packId && packId !== 'egg-channel' && !!card.backUrl
    && /^\/luma-card-library\/assets\/[a-f0-9]{64}\.png$/.test(card.backUrl)
  const lightingDisabled = mode === 'static' || !materialBack || !!(card.backUrl && failedImages[card.backUrl]) || materialAvailable === false
  const back = Math.cos(angle.y * Math.PI / 180) < 0
  const pictureUrl = side === 'back' ? card.backUrl : card.frontUrl
  const layerUrls = card.layers && [card.layers.background, card.layers.subject]
  const layerSourceAvailable = !!layerUrls?.every(url => /^\/luma-card-library\/assets\/[a-f0-9]{64}\.png$/.test(url) && !failedImages[url])
  const layered = layerSourceAvailable && !!layerUrls?.every(url => loadedLayers[url])
  const attemptedUrl = (url: string) => imageAttempt ? `${url}?retry=${imageAttempt}` : url

  function send(command: Command, value?: boolean) {
    frame.current?.contentWindow?.postMessage({ type: 'luma-card-viewer-command', editionKey: card.key, command, value }, location.origin)
  }
  function lightingKey(event: KeyboardEvent<HTMLInputElement>, property: keyof PackLighting) {
    const step = property === 'intensity' ? .05 : 1
    const min = property === 'azimuth' ? -180 : property === 'elevation' ? 10 : .35
    const max = property === 'azimuth' ? 180 : property === 'elevation' ? 80 : 2
    const direction = ['ArrowRight', 'ArrowUp', 'PageUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown', 'PageDown'].includes(event.key) ? -1 : 0
    if (!direction && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    setLighting(current => normalizePackLighting({ ...current, [property]: event.key === 'Home' ? min : event.key === 'End' ? max : Math.round((current[property] + step * direction * (event.key.startsWith('Page') ? 10 : 1)) * 100) / 100 }))
  }
  useEffect(() => {
    const element = viewport.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect(), scale = Math.min(box.width * .84 / card.width, box.height * .88 / card.height)
      if (scale > 0) setSize({ width: card.width * scale, height: card.height * scale })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [card.width, card.height])
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { setReduced(media.matches); send('reduced', media.matches) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [card.key])
  useEffect(() => {
    if (!live) { setReadyKey(null); return }
    setReadyKey(null)
    setMaterialAvailable(null)
    const current = frame.current
    const timer = setTimeout(() => setFailed(true), 30000)
    function receive(event: MessageEvent) {
      if (event.origin !== location.origin || event.source !== current?.contentWindow || event.data?.editionKey !== card.key) return
      if (event.data.type === 'luma-card-studio-state') {
        if (event.data.state === 'ready' || event.data.state === 'unavailable') setMaterialAvailable(event.data.state === 'ready')
        return
      }
      if (event.data.type !== 'luma-card-viewer-state') return
      if (event.data.state === 'close-requested') { close.current?.(); return }
      if (event.data.state === 'failed') { clearTimeout(timer); setFailed(true); return }
      if (event.data.state !== 'ready' || !Number.isFinite(event.data.yaw) || !Number.isFinite(event.data.pitch)) return
      clearTimeout(timer); setReadyKey(card.key)
      setAngle({ x: event.data.pitch * 180 / Math.PI, y: event.data.yaw * 180 / Math.PI })
      setSide(event.data.back && card.backUrl ? 'back' : 'front')
    }
    window.addEventListener('message', receive)
    return () => {
      clearTimeout(timer); window.removeEventListener('message', receive)
      try {
        // Same-origin frozen package only. Synchronous teardown precedes frame removal.
        const child = current?.contentWindow as (Window & { __lumaCardEmbed?: { dispose(): void } }) | null
        child?.__lumaCardEmbed?.dispose()
      } catch { /* Removing the iframe still destroys its context after an incomplete load. */ }
    }
  }, [live, card.key, card.backUrl])
  useEffect(() => { if (live && ready) send('reduced', reduced) }, [live, ready, reduced])
  useEffect(() => {
    if (live && ready && materialBack && materialAvailable !== false) frame.current?.contentWindow?.postMessage({ type: 'luma-card-studio-light', editionKey: card.key, lighting }, location.origin)
  }, [live, ready, materialBack, materialAvailable, card.key, lighting])
  function pose(x: number, y: number) {
    const next = { x: Math.max(-40, Math.min(40, x)), y: y % 360 }
    setAngle(next); setSide(Math.cos(next.y * Math.PI / 180) < 0 && card.backUrl ? 'back' : 'front')
  }
  function command(value: Command) {
    if (value === 'front' || value === 'reset') { setSide('front'); pose(0, 0) }
    if (value === 'back') { setSide('back'); pose(0, 180) }
    if (value === 'edge') pose(0, 90)
    if (value === 'left') pose(angle.x, angle.y - 30)
    if (value === 'right') pose(angle.x, angle.y + 30)
    if (live) send(value)
  }
  function release(event: PointerEvent) {
    if (pointer.current?.id !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    pointer.current = null
  }
  const frontStyle = { aspectRatio: `${card.width} / ${card.height}` }
  const image = (face: 'front' | 'back') => {
    const url = face === 'front' ? card.frontUrl : card.backUrl
    if (!url) return <div className="lumaCardViewerMissing">此版本尚未收录背面</div>
    if (failedImages[url]) return <div className="lumaCardViewerMissing">图片暂时无法加载</div>
    return <img key={`${face}-${imageAttempt}`} src={imageAttempt ? `${url}?retry=${imageAttempt}` : url}
      alt={face === 'front' ? card.alt : `${card.name}的卡背`}
      width={face === 'back' ? card.backWidth ?? card.width : card.width}
      height={face === 'back' ? card.backHeight ?? card.height : card.height} draggable={false}
      onError={() => setFailedImages(current => ({ ...current, [url]: true }))} />
  }

  return <div className="lumaCardViewer" data-viewer-kind={live ? 'original-craft' : mode === 'static' ? 'static' : layered ? 'layered-card' : 'thin-card'}>
    {mode === 'interactive' && layerSourceAvailable && card.layers && <div hidden aria-hidden="true">{[card.layers.background, card.layers.subject].map(url => <img key={`${url}-${imageAttempt}`} src={imageAttempt ? `${url}?retry=${imageAttempt}` : url} alt="" onLoad={() => setLoadedLayers(current => ({ ...current, [url]: true }))} onError={() => setFailedImages(current => ({ ...current, [url]: true }))} />)}</div>}
    <div ref={viewport} className={`lumaCardViewerViewport${card.width > card.height ? ' is-landscape' : ''}`}>
      {live ? <><iframe ref={frame} className={ready ? 'is-ready' : ''} title={`${card.name}卡牌预览`} src={viewerUrl} sandbox="allow-scripts allow-same-origin" allow="autoplay 'none'; camera 'none'; microphone 'none'" referrerPolicy="no-referrer" onError={() => setFailed(true)} />{!ready && <div className="lumaCardViewerLoading">{image('front')}<span>正在加载…</span></div>}</>
        : mode === 'static' ? <figure className="lumaCardViewerStatic">{pictureUrl ? image(side) : <div>此版本尚未收录背面</div>}</figure>
          : <div className="lumaCardViewerInteraction" role="group" tabIndex={0} aria-label="可360度旋转卡牌。拖动或方向键转动，F翻面，R回正。" onKeyDown={event => {
            const key = event.key.toLowerCase()
            if (!['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'f', 'r', 'home'].includes(key)) return
            event.preventDefault(); event.stopPropagation()
            if (key === 'f') command(back ? 'front' : 'back')
            else if (key === 'r' || key === 'home') command('reset')
            else pose(angle.x + (key === 'arrowup' ? -5 : key === 'arrowdown' ? 5 : 0), angle.y + (key === 'arrowleft' ? -15 : key === 'arrowright' ? 15 : 0))
          }} onPointerDown={event => {
            if (event.button !== 0) return
            event.preventDefault(); pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
            event.currentTarget.setPointerCapture?.(event.pointerId); event.currentTarget.focus({ preventScroll: true })
          }} onPointerMove={event => {
            const last = pointer.current
            if (!last || last.id !== event.pointerId) return
            pose(angle.x + (event.clientY - last.y) * .25, angle.y + (event.clientX - last.x) * 360 / Math.max(200, size.width))
            pointer.current = { id: last.id, x: event.clientX, y: event.clientY }
          }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={() => { pointer.current = null }}>
            <div className="lumaCardViewerSolid" data-yaw={angle.y} data-frame-design={frameFinish?.frame?.id} style={{ width: size.width, height: size.height,
              '--card-thickness': `${Math.max(2, size.width * (frameFinish?.frame?.depth.cardThickness ?? .009))}px`,
              '--frame-relief-lift': `${size.width * (frameFinish?.frame?.depth.reliefLift ?? 0)}px`,
              '--frame-edge-light': frameFinish?.light, '--frame-edge-mid': frameFinish?.mid, '--frame-edge-deep': frameFinish?.deep,
              '--frame-angle-light': reduced ? .5 : Math.max(.18, Math.min(.92, .45 + Math.sin((angle.y + angle.x * .6) * Math.PI / 180) * .45)),
              transform: `rotateX(${-angle.x}deg) rotateY(${angle.y}deg)` } as CSSProperties}>
              <figure className="lumaCardViewerFace is-front" aria-hidden={back} style={frontStyle}>{layered && card.layers ? <img src={attemptedUrl(card.layers.background)} alt={card.alt} width={card.width} height={card.height} draggable={false} /> : image('front')}{!failedImages[card.frontUrl] && <PremiumCardFinish card={card} active={!back} reduced={reduced} plane={frameFinish?.frame ? 'base' : 'all'} light={angle} />}</figure>
              {frameFinish?.frame && !failedImages[card.frontUrl] && <>
                <figure className="lumaCardViewerFrameRelief is-extrusion" aria-hidden="true"><PremiumCardFinish card={card} plane="relief" light={angle} reduced={reduced}/></figure>
                <figure className="lumaCardViewerFrameRelief is-polished" aria-hidden="true"><PremiumCardFinish card={card} plane="relief" light={angle} reduced={reduced}/></figure>
              </>}
              {layered && card.layers && <figure className="lumaCardViewerSubject" aria-hidden={true} style={{ transform: `translateZ(calc(var(--card-thickness) / 2 + ${reduced ? 0 : Math.min(8, size.width * .022)}px))` }}><img src={attemptedUrl(card.layers.subject)} alt="" width={card.width} height={card.height} draggable={false} /></figure>}
              <figure className="lumaCardViewerFace is-back" aria-hidden={!back} style={frontStyle}>{image('back')}{materialBack && packId && card.backUrl && !failedImages[card.backUrl] && <PackBackSurface key={`${card.key}-${imageAttempt}`} url={attemptedUrl(card.backUrl)} packId={packId} lighting={lighting} yaw={reduced ? 180 : angle.y} pitch={reduced ? 0 : angle.x} onAvailabilityChange={setMaterialAvailable} />}</figure>
              <i className="lumaCardViewerEdge is-left" /><i className="lumaCardViewerEdge is-right" /><i className="lumaCardViewerEdge is-top" /><i className="lumaCardViewerEdge is-bottom" />
            </div>
          </div>}
    </div>
    {Object.values(failedImages).some(Boolean) && <div className="lumaCardViewerImageIssue" role="status">图片暂时无法加载。<button className="lumaCardLibraryButton" onClick={() => { setFailedImages({}); setLoadedLayers({}); setImageAttempt(value => value + 1) }}>重试图片</button></div>}
    <div className="lumaCardViewerToolbar">
      <div className="lumaCardViewerMode" role="group" aria-label="观看方式">
        <button className="lumaCardLibraryButton" aria-pressed={mode === 'interactive'} onClick={() => { setMode('interactive'); setFailed(false) }}>动态</button>
        <button className="lumaCardLibraryButton" aria-pressed={mode === 'static'} onClick={() => setMode('static')}>静态</button>
      </div>
      <div className="lumaCardViewerFaces" role="group" aria-label="卡牌朝向">
        <button className="lumaCardLibraryButton" aria-pressed={!back && (mode === 'static' || Math.abs(Math.cos(angle.y * Math.PI / 180)) > .02)} onClick={() => command('front')}>正面</button>
        <button className="lumaCardLibraryButton" aria-pressed={back} disabled={!card.backUrl} onClick={() => command('back')}>背面</button>
        <button className="lumaCardLibraryButton" aria-pressed={mode === 'interactive' && Math.abs(Math.cos(angle.y * Math.PI / 180)) <= .02} disabled={mode === 'static'} onClick={() => command('edge')}>侧边</button>
      </div>
      <button className="lumaCardLibraryButton lumaCardViewerReset" onClick={() => command('reset')}>回正</button>
      <div className="lumaCardViewerPreferences"><label className="lumaCardViewerReduced"><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />减少动态</label>
        <LumaHelpTip label="卡牌操作说明" content="拖动或方向键旋转，F 翻面，R 回正。切换静态可查看完整原图。" /></div>
    </div>
    {back && !lightingDisabled && <fieldset className="lumaCardViewerLighting">
      <legend>卡背灯光</legend>
      <label><span>灯光方向 <span className="lumaCardViewerLightValue" aria-hidden="true">{lighting.azimuth}°</span></span><input aria-label="灯光方向" aria-valuetext={`${lighting.azimuth}度`} type="range" min={-180} max={180} step={1} value={lighting.azimuth} onKeyDown={event => lightingKey(event, 'azimuth')} onChange={event => setLighting(current => normalizePackLighting({ ...current, azimuth: Number(event.target.value) }))} /></label>
      <label><span>灯光高度 <span className="lumaCardViewerLightValue" aria-hidden="true">{lighting.elevation}°</span></span><input aria-label="灯光高度" aria-valuetext={`${lighting.elevation}度`} type="range" min={10} max={80} step={1} value={lighting.elevation} onKeyDown={event => lightingKey(event, 'elevation')} onChange={event => setLighting(current => normalizePackLighting({ ...current, elevation: Number(event.target.value) }))} /></label>
      <label><span>灯光强度 <span className="lumaCardViewerLightValue" aria-hidden="true">{Math.round(lighting.intensity * 100)}%</span></span><input aria-label="灯光强度" aria-valuetext={`${Math.round(lighting.intensity * 100)}%`} type="range" min={35} max={200} step={5} value={Math.round(lighting.intensity * 100)} onKeyDown={event => lightingKey(event, 'intensity')} onChange={event => setLighting(current => normalizePackLighting({ ...current, intensity: Number(event.target.value) / 100 }))} /></label>
      <button className="lumaCardLibraryButton" type="button" onClick={() => setLighting(normalizePackLighting(DEFAULT_PACK_LIGHTING))}>重置灯光</button>
    </fieldset>}
    {(failed || !card.backUrl) && <p className="lumaCardLibraryArtHint" role="status">{failed ? '动态暂不可用，仍可查看完整卡牌。' : '此版本尚未收录背面'}</p>}
  </div>
}
