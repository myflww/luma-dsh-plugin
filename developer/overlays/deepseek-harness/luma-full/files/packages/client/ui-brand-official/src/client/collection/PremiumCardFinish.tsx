import { useId, type CSSProperties } from 'react'
import type { CardEditionDefinition } from './cardLibraryTypes.ts'
import { resolvePremiumCardFinish, type PremiumCardMotif, type PremiumCardFinishDefinition, type HolographicPattern } from './premiumCardFinishDesign.ts'
import './PremiumCardFinish.css'

function Motif({ motif }: { motif: PremiumCardMotif }) {
  if (motif === 'tide') return <><path d="M-17 0q8-13 17 0t17 0M-14 8q7-8 14 0t14 0" /><path d="M0-18q10 12 0 18-10-6 0-18Z" /></>
  if (motif === 'moon') return <><path d="M5-17A17 17 0 1 0 15 10 14 14 0 0 1 5-17Z" /><path d="m12-15 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /></>
  if (motif === 'leaf') return <><path d="M0 18V-16M0 4C-25 3-21-15-4-14 0-10 2-3 0 4ZM1-1C25-2 21-20 6-17 2-12 0-5 1-1ZM-14-9 0 4 15-10" /></>
  if (motif === 'snow') return <><path d="M0-20v40M-17-10l34 20M-17 10 17-10M-5-14l5 5 5-5M-5 14l5-5 5 5M-15 0l7-1-2-7M15 0l-7 1 2 7M-10 8l2-7-7-1M10-8 8-1l7 1" /></>
  if (motif === 'prism') return <><path d="m0-20 18 20L0 20-18 0ZM0-20 7 0 0 20-7 0ZM-18 0h36" /><path d="m-24-6 3-3 3 3M18 6l3 3 3-3" /></>
  if (motif === 'flame') return <><path d="M-12 12C-26-5-7-5-5-20c10 7 4 11 13 15 13 8 7 24-8 25-8-6-8-12-3-19-9 4-10 8-9 11Z" /><path d="M-20 14q20 13 40 0" /></>
  if (motif === 'petal') return <><path d="M0 0C-25-8-15-28 0-10 15-28 25-8 0 0ZM0 0c24-13 29 9 6 11 2 21-20 19-12 0C-29 9-24-13 0 0Z" /><circle r="3" /></>
  return <><path d="M0 18V8M0 14q-15-2-17-12 13-3 17 8M0 11Q15 5 17-3 4-4 0 6" /><path d="M0-16c8-9 18 1 12 8 10 9-2 20-12 13-10 7-22-4-12-13-6-7 4-17 12-8Z" /><path d="m0-11 8 6-3 10-11-2-3-9Z" /></>
}

function Blossom({ x, y, petals = 7, size = 16 }: { x: number; y: number; petals?: number; size?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    {Array.from({ length: petals }, (_, i) => <path key={i} className="lumaFramePetal" d={`M0 0C${-size * .7} ${-size * .5} ${-size * .58} ${-size * 1.45} 0 ${-size * 1.35}C${size * .58} ${-size * 1.45} ${size * .7} ${-size * .5} 0 0Z`} transform={`rotate(${i * 360 / petals})`} />)}
    <circle className="lumaFrameGem" r={size * .41} /><circle className="lumaFrameGemGlint" cx={-size * .13} cy={-size * .15} r={size * .12} />
  </g>
}

/** Eight different castings, derived from the rose, lily and moon-astrolabe archive. */
function CastCorner({ motif }: { motif: PremiumCardMotif }) {
  if (motif === 'rose') return <>
    <path className="lumaFrameCast" d="M0 105C19 99 23 82 18 68 10 45 13 27 34 16 55 5 82 17 105 0 76 30 49 13 32 32 18 48 29 59 32 76 35 93 20 107 0 110ZM8 8C25 5 39 14 35 28 32 40 19 43 13 35 7 28 14 22 20 26 9 19 7 15 8 8Z" />
    <path className="lumaFrameFine" d="M4 99C42 67 8 43 42 24 59 14 88 21 102 4M26 46C45 38 57 42 65 31M22 64C41 57 39 45 49 42" />
    <path className="lumaFrameLeaf" d="M31 52C35 29 53 28 60 33 58 45 47 53 31 52ZM24 74C43 60 48 68 47 77 39 85 31 84 24 74Z" />
    <Blossom x={25} y={24} petals={6} size={15} /><Blossom x={63} y={19} petals={5} size={9} />
  </>
  if (motif === 'petal') return <>
    <path className="lumaFrameCast" d="M0 104Q34 79 20 51C3 20 19 4 49 20 79 34 104 0 105 0 87 34 71 38 45 30 20 22 21 39 30 56 39 77 21 101 0 109ZM9 10Q22 4 29 12 36 22 26 29 14 36 9 24Z" />
    <path className="lumaFrameShell" d="M15 68Q17 27 55 15 45 44 15 68Z" />
    <path className="lumaFrameFine" d="M18 61 46 21M17 51 39 23M24 59 49 29M4 99Q36 73 25 53M52 25Q80 34 99 5" />
    <Blossom x={28} y={27} petals={5} size={14} />
    {[0, 1, 2, 3].map(i => <circle key={i} className="lumaFramePearl" cx={10 + i * 3} cy={81 - i * 9} r={2.3 - i * .2} />)}
  </>
  if (motif === 'snow') return <>
    <path className="lumaFrameCast" d="M1 106 8 67 2 39 12 9 41 2 69 8 106 1 80 16 48 12 25 22 15 47 18 79Z" />
    <path className="lumaFrameLily" d="M27 31C9 13 10-1 24 3 31 5 34 16 27 31ZM27 31C24 9 36 2 44 12 49 20 37 27 27 31ZM27 31C42 15 58 22 53 34 48 46 33 38 27 31Z" />
    <path className="lumaFrameFine" d="M27 31 18 15M27 31l10-14M27 31l17 2M8 87 12 58 8 44M44 8l14 4 29-4M10 101l12-11M101 10 90 22" />
    <path className="lumaFrameCrystal" d="m14 69 6 10-6 17-6-17Zm55-55 10-6 17 6-17 6Z" />
    <circle className="lumaFramePearl" cx="27" cy="31" r="4" />
  </>
  if (motif === 'tide') return <>
    <path className="lumaFrameCast" d="M0 111C33 95 4 74 23 56 42 38 47 49 56 23 64 0 91 29 111 0 97 34 74 13 66 34 56 58 40 46 30 64 22 80 42 100 0 116Z" />
    <path className="lumaFrameShell" d="M25 48C1 41-1 21 10 23-1 5 15-3 21 7 23-10 42-1 39 11 54 4 66 18 52 28 71 36 45 49 25 48Z" />
    <path className="lumaFrameFine" d="M25 46 9 26M25 46 13 13M25 46 25 8M25 46 37 14M25 46 48 24M25 46l25-10M7 108C33 92 15 76 28 62" />
    <ellipse className="lumaFrameGem" cx="27" cy="44" rx="10" ry="7" /><circle className="lumaFramePearl" cx="26" cy="43" r="4" />
    <circle className="lumaFramePearl" cx="65" cy="25" r="3" /><circle className="lumaFramePearl" cx="21" cy="67" r="3" />
  </>
  if (motif === 'moon') return <>
    <path className="lumaFrameCast" d="M0 107Q22 94 15 76L3 57Q30 51 16 33L7 12Q37 16 55 3 55 29 77 16L107 0Q95 24 78 26 54 44 43 28L28 43Q44 54 26 78 24 95 0 113Z" />
    <path className="lumaFrameWing" d="M15 69Q17 25 68 15 46 26 45 39 35 34 28 48 20 45 15 69Z" />
    <path className="lumaFrameFine" d="M17 65Q30 31 65 17M28 44 30 28M44 36 45 23M4 103Q23 87 16 75M75 16Q91 23 103 4" />
    <path className="lumaFrameCrystal" d="m29 17 14 12-14 18-14-18Z" /><path className="lumaFrameGem" d="m29 23 7 7-7 10-7-10Z" />
    <circle className="lumaFramePearl" cx="17" cy="79" r="3" /><circle className="lumaFramePearl" cx="79" cy="17" r="3" />
  </>
  if (motif === 'leaf') return <>
    <path className="lumaFrameCast" d="M0 111C27 98 34 75 20 57 9 44 16 24 32 18 55 9 82 27 111 0 91 34 61 23 46 28 27 34 25 45 34 57 48 78 31 106 0 117ZM9 10C12 3 28 8 30 18 34 33 19 39 13 31 8 24 16 19 20 24 23 13 9 20 9 10Z" />
    <path className="lumaFrameLeaf" d="M29 55C39 31 59 34 65 45 56 59 42 61 29 55ZM21 82C28 61 44 63 51 72 44 85 31 90 21 82Z" />
    <path className="lumaFrameFine" d="M8 105C43 78 20 50 37 33 55 16 84 30 106 5M29 55l27-10M22 80l21-8" />
    <Blossom x={26} y={25} petals={10} size={13} /><circle className="lumaFrameGem" cx="77" cy="18" r="5" />
  </>
  if (motif === 'prism') return <>
    <path className="lumaFrameCast" d="M0 104V51L11 11 51 0h53L84 11H53L22 22 11 53v31Z" />
    <path className="lumaFrameCrystal" d="m30 5 23 25-23 25L5 30Z" /><path className="lumaFrameGem" d="m30 15 14 15-14 15-15-15Z" />
    <path className="lumaFrameFine" d="M30 5v50M5 30h48M30 15l7 15-7 15-7-15ZM4 96V54L17 17 54 4h42" />
    <path className="lumaFrameCrystal" d="m62 10 14 7-14 7-8-7ZM10 62l7-8 7 8-7 14Z" />
    <path className="lumaFrameInlay" d="m53 3 31 0-10 7H53ZM3 53v31l7-10V53Z" />
  </>
  return <>
    <path className="lumaFrameCast" d="M0 113V62Q12 42 8 8 42 12 62 0h51L88 11H64Q48 21 25 25 21 48 11 64v24Z" />
    <path className="lumaFrameWing" d="M15 77Q25 54 15 18 54 25 77 15 55 33 49 33 44 23 38 35 31 32 35 48 33 57 15 77Z" />
    <path className="lumaFrameCrystal" d="M15 31 31 8 47 31 31 58Z" /><path className="lumaFrameGem" d="m31 19 8 13-8 15-8-15Z" />
    <path className="lumaFrameFine" d="M4 104V64Q17 38 13 13 38 17 64 4h40M31 9v48M16 31h30M20 67 29 57M67 20 57 29" />
    <circle className="lumaFramePearl" cx="16" cy="88" r="2.4" /><circle className="lumaFramePearl" cx="88" cy="16" r="2.4" />
  </>
}

type FramePlane = 'all' | 'base' | 'relief'
interface FrameLight { readonly x: number; readonly y: number }

/** Tiny diffraction engravings stay in the perimeter, rather than washing across the portrait. */
function HolographicEtching({ pattern }: { pattern: HolographicPattern }) {
  if (pattern === 'rain') return <path d="M8 0 0 16M27 0 3 48M48 0 24 48M54 15 38 47M17 9l3 5-3 5-3-5Z"/>
  if (pattern === 'petal') return <path d="M27 27C6 25 5 6 23 19 19 0 39 0 31 20 50 8 54 29 34 29 47 46 25 52 26 34 6 47-1 27 20 28ZM2 2l4 4M46 46l5 5"/>
  if (pattern === 'constellation') return <><path d="m8 14 17 9 20-13M25 23l-7 24M45 10l4 27-31 10M23 21l2-7 2 7 7 2-7 2-2 7-2-7-7-2Z"/><circle cx="8" cy="14" r="2"/><circle cx="45" cy="10" r="2"/><circle cx="18" cy="47" r="2"/></>
  if (pattern === 'wave') return <><path d="M0 13q13-13 27 0t27 0M0 27q13-13 27 0t27 0M0 41q13-13 27 0t27 0"/><circle cx="13" cy="26" r="2"/></>
  if (pattern === 'leaf') return <path d="M0 54 54 0M13 41C1 23 17 16 23 31M27 27C15 10 31 3 37 17M13 41C29 45 37 31 24 30M27 27C45 31 52 16 39 16"/>
  if (pattern === 'snow') return <path d="M27 5v44M8 16l38 22M8 38l38-22M20 10l7 7 7-7M20 44l7-7 7 7M10 23l10 1-4-9M44 31l-10-1 4 9M10 31l10-1-4 9M44 23l-10 1 4-9"/>
  if (pattern === 'wing') return <path d="M27 48V19M27 26C2 34-1 3 18 9L27 26ZM27 26C52 34 55 3 36 9L27 26ZM27 28C1 24 8 49 24 39ZM27 28C53 24 46 49 30 39ZM21 12l6 7 6-7"/>
  return <path d="m27 2 25 25-25 25L2 27ZM27 2l9 25-9 25-9-25ZM2 27h50M8 8l7 2M46 46l-7-2"/>
}

function HeirloomFrame({ card, finish, instanceId, active, reduced, plane, light }: {
  card: Pick<CardEditionDefinition, 'key' | 'width' | 'height'>
  finish: PremiumCardFinishDefinition
  instanceId: string
  active: boolean
  reduced: boolean
  plane: FramePlane
  light?: FrameLight
}) {
  const binding = finish.frame!
  const width = 600, height = Math.round(width * card.height / card.width), ssr = finish.tier === 'SSR'
  const lightX = reduced ? 0 : light?.x ?? 0, lightY = reduced ? 0 : light?.y ?? 0
  const opticalTurn = lightY * .55 - lightX * .3
  const opticalShift = Math.sin(lightY * Math.PI / 180) * 155
  const id = `lumaHeirloom${instanceId}`
  const corner = `${id}Corner`, metal = `${id}Metal`, foil = `${id}Foil`, shade = `${id}Shade`, gem = `${id}Gem`, safe = `${id}Safe`, etch = `${id}Etch`, clearance = `${id}Clearance`
  const x = 13, y = 13
  const outer = finish.motif === 'prism' ? `M${x + 38} ${y}H${width - x - 38}L${width - x} ${y + 38}V${height - y - 38}L${width - x - 38} ${height - y}H${x + 38}L${x} ${height - y - 38}V${y + 38}Z`
    : `M${x + 17} ${y}H${width - x - 17}Q${width - x} ${y} ${width - x} ${y + 17}V${height - y - 17}Q${width - x} ${height - y} ${width - x - 17} ${height - y}H${x + 17}Q${x} ${height - y} ${x} ${height - y - 17}V${y + 17}Q${x} ${y} ${x + 17} ${y}Z`
  const top = binding.layout === 'open-top' || binding.layout === 'low-crest' ? .62 : 1
  const left = binding.layout === 'open-left' ? .62 : 1, right = binding.layout === 'open-right' ? .62 : 1
  const topCrest = binding.layout !== 'open-top' && binding.layout !== 'low-crest'
  const scale = binding.cornerScale * (ssr ? 1.03 : .86)
  return <svg className="lumaPremiumCardFinish lumaHeirloomFrame" data-premium-finish={finish.tier} data-motif={finish.motif}
    data-frame-design={binding.id} data-frame-layout={binding.layout} data-foil={binding.foil}
    data-frame-plane={plane} data-holographic-pattern={binding.finish.pattern} data-holographic-finish={binding.finish.mode}
    data-active={active} data-reduced={reduced} data-edition-key={card.key}
    viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
    style={{ '--premium-light': finish.light, '--premium-mid': finish.mid, '--premium-deep': finish.deep, '--frame-enamel': finish.enamel, '--frame-gem': finish.gem,
      '--frame-metal-paint': `url(#${metal})`, '--frame-gem-paint': `url(#${gem})`, '--frame-holographic-strength': binding.finish.strength } as CSSProperties}>
    <title>{`${finish.tier} · ${finish.motif} · 雕花金属框与选择性镭射`}</title>
    <defs>
      <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1" gradientTransform={`rotate(${opticalTurn * .35} .5 .5)`}>
        <stop offset="0" stopColor={finish.light}/><stop offset=".13" stopColor={finish.mid}/><stop offset=".27" stopColor={finish.light}/>
        <stop offset=".38" stopColor={finish.deep}/><stop offset=".52" stopColor={finish.mid}/><stop offset=".7" stopColor={finish.light}/><stop offset=".82" stopColor={finish.mid}/><stop offset="1" stopColor={finish.deep}/>
      </linearGradient>
      <linearGradient id={shade} x1="0" y1="0" x2="1" y2="1"><stop stopColor={finish.deep}/><stop offset=".48" stopColor={finish.enamel}/><stop offset="1" stopColor={finish.deep}/></linearGradient>
      <radialGradient id={gem} cx=".3" cy=".25" r=".8"><stop stopColor={finish.light}/><stop offset=".22" stopColor={finish.gem}/><stop offset=".75" stopColor={finish.gem}/><stop offset="1" stopColor={finish.enamel}/></radialGradient>
      <linearGradient id={foil} gradientUnits="userSpaceOnUse" x1="-120" y1={height} x2="720" y2="0" gradientTransform={`translate(${opticalShift} 0) rotate(${opticalTurn} 300 ${height / 2})`}><stop stopColor="#60d6fa"/><stop offset=".18" stopColor="#bd8fff"/><stop offset=".35" stopColor="#ffd7a1"/><stop offset=".49" stopColor="#d8fff2"/><stop offset=".64" stopColor="#92e7ce"/><stop offset=".81" stopColor="#ef9fc5"/><stop offset="1" stopColor="#82bdfd"/></linearGradient>
      <pattern id={etch} width="54" height="54" patternUnits="userSpaceOnUse" patternTransform={`rotate(${18 + opticalTurn * .1})`}><g className="lumaFrameDiffractionMark" stroke={`url(#${foil})`}><HolographicEtching pattern={binding.finish.pattern}/></g></pattern>
      <mask id={safe}><rect width={width} height={height} fill="white"/><rect x="76" y="76" width={width - 152} height={height - 152} rx="35" fill="black"/></mask>
      <g id={corner}><CastCorner motif={finish.motif}/></g>
      {binding.clearance && <mask id={clearance}><rect width={width} height={height} fill="white"/><rect x={width - 40} y={height * binding.clearance.start} width="40" height={height * (binding.clearance.end - binding.clearance.start)} rx="7" fill="black"/></mask>}
    </defs>
    <g data-art-clearance={binding.clearance?.edge} mask={binding.clearance ? `url(#${clearance})` : undefined}>
    {plane !== 'relief' && <g className="lumaFrameFoundation">
      <path className="lumaFrameOuterShadow" d={outer}/>
      <path className="lumaFrameOuterMetal" d={outer} stroke={`url(#${metal})`}/>
      <path className="lumaFrameEnamelLine" d={outer} stroke={`url(#${shade})`}/>
      <rect className="lumaFrameInnerDark" x="25" y="25" width={width - 50} height={height - 50} rx={finish.motif === 'prism' ? 3 : 10}/>
      <rect className="lumaFrameInnerHairline" x="28" y="28" width={width - 56} height={height - 56} rx={finish.motif === 'prism' ? 2 : 8}/>
      <path className="lumaFrameTopReflection" d={`M${x + 18} ${y - 3}H${width - x - 18}M${x - 3} ${y + 18}V${height * .38}`} />
      <path className="lumaFrameBottomShade" d={`M${x + 18} ${height - y + 3}H${width - x - 18}M${width - x + 3} ${height * .62}V${height - y - 18}`} />
    </g>}
    {plane !== 'base' && <g className="lumaFrameSculpture">
      <use href={`#${corner}`} transform={`translate(16 16) scale(${scale * left * top})`}/>
      <use href={`#${corner}`} transform={`translate(${width - 16} 16) scale(${-scale * right * top} ${scale * right * top})`}/>
      <use href={`#${corner}`} transform={`translate(16 ${height - 16}) scale(${scale * left} ${-scale * left})`}/>
      <use href={`#${corner}`} transform={`translate(${width - 16} ${height - 16}) scale(${-scale * right} ${-scale * right})`}/>
      {finish.motif === 'prism' ? <>
        <path className="lumaFrameInlay" d={`M12 ${height * .3} 23 ${height * .32}V${height * .68}L12 ${height * .7}ZM588 ${height * .3} 577 ${height * .32}V${height * .68}L588 ${height * .7}Z`}/>
        <path className="lumaFramePrismTrace" d={`M34 ${height * .2}V${height * .36}L42 ${height * .38}V${height * .62}L34 ${height * .64}V${height * .8}M566 ${height * .2}V${height * .36}L558 ${height * .38}V${height * .62}L566 ${height * .64}V${height * .8}`}/>
      </> : finish.motif === 'tide' ? <>
        {[0, 1, 2, 3, 4, 5, 6].map(i => <g key={i}><circle className="lumaFramePearl" cx="16" cy={height * .43 + i * 17} r={i === 3 ? 3.6 : 1.8}/><circle className="lumaFramePearl" cx="584" cy={height * .43 + i * 17} r={i === 3 ? 3.6 : 1.8}/></g>)}
        <path className="lumaFrameFine" d={`M110 ${height - 22}q30-15 60 0t60 0M370 ${height - 22}q30-15 60 0t60 0`}/>
      </> : finish.motif === 'moon' ? <>
        {[0, 1, 2, 3, 4].map(i => <circle key={i} className={i === 2 ? 'lumaFrameGem' : 'lumaFrameMoonPhase'} cx={width / 2 + (i - 2) * 22} cy={height - 24} r={i === 2 ? 8 : 4 - Math.abs(i - 2) * .8}/>)}
        <path className="lumaFrameFine" d={`M260 ${height - 24}q40-25 80 0M260 ${height - 24}q40 16 80 0`}/>
      </> : <>
        {[height * .34, height * .66].map(cy => <g key={cy}>
          <path className="lumaFrameSideSetting" d={`M16 ${cy - 29}q-10 16 0 29-10 13 0 29 10-16 0-29 10-13 0-29ZM584 ${cy - 29}q-10 16 0 29-10 13 0 29 10-16 0-29 10-13 0-29Z`}/>
          <ellipse className="lumaFrameGem" cx="16" cy={cy} rx="3" ry="6"/><ellipse className="lumaFrameGem" cx="584" cy={cy} rx="3" ry="6"/>
        </g>)}
      </>}
      {topCrest && <g transform={`translate(300 24) scale(${ssr ? .78 : .58})`} className="lumaFrameCrest"><Motif motif={finish.motif}/></g>}
      {finish.motif !== 'moon' && <g transform={`translate(300 ${height - 25}) scale(${ssr ? .82 : .62})`} className="lumaFrameCrest"><Motif motif={finish.motif}/></g>}
      {ssr && <g className="lumaFrameSSRMount">
        <path className="lumaFrameCast" d={`M249 ${height - 23}q26-21 51-18 25-3 51 18-19-4-29 4-22 20-44 0-10-8-29-4Z`}/>
        <path className="lumaFrameCrystal" d={`m300 ${height - 46} 15 19-15 19-15-19Z`}/>
        <path className="lumaFrameGem" d={`m300 ${height - 39} 9 12-9 12-9-12Z`}/>
        <path className="lumaFrameFine" d={`M258 ${height - 24}q22-13 31-8M342 ${height - 24}q-22-13-31-8`}/>
      </g>}
    </g>}
    {plane !== 'relief' && <g className="lumaFrameOptics" mask={`url(#${safe})`}>
      <path className="lumaFrameSelectiveFoil" d={outer} stroke={`url(#${foil})`}/>
      <rect className="lumaFrameHolographicEtching" x="33" y="33" width={width - 66} height={height - 66} rx="12" stroke={`url(#${etch})`}/>
      <path className="lumaPremiumMovingGlint" d={outer} pathLength="100"/>
      {<rect className="lumaFrameAngleReflection" x="8" y="8" width={width - 16} height={height - 16} rx="15"/>}
    </g>}
    </g>
  </svg>
}

/** Edge-only light, micro-etching and character motifs. The source character never moves or changes. */
export function PremiumCardFinish({ card, active = false, reduced = false, plane = 'all', light }: {
  card: Pick<CardEditionDefinition, 'key' | 'width' | 'height' | 'rarity' | 'characterId'> & Partial<Pick<CardEditionDefinition, 'workId' | 'viewerKind'>>
  /** Thumbnail finishes animate on hover/focus; the selected interactive fallback can play continuously. */
  active?: boolean
  reduced?: boolean
  /** The viewer puts sculpted ornaments on an independent raised physical plane. */
  plane?: FramePlane
  light?: FrameLight
}) {
  const instanceId = useId().replace(/:/g, '')
  const finish = resolvePremiumCardFinish(card)
  if (!finish) return null
  if (finish.frame) return <HeirloomFrame card={card} finish={finish} instanceId={instanceId} active={active} reduced={reduced} plane={plane} {...light === undefined ? {} : { light }}/>
  const width = 600, height = Math.round(width * card.height / card.width)
  const inset = 12, margin = 30, center = width / 2
  const foilId = `lumaPremiumFoil${instanceId}`
  const etchId = `lumaPremiumEtch${instanceId}`
  const label = finish.tier === 'SSR' ? '虹彩蚀刻与主题流光' : '主题镭射与微光'
  // Fixed, edge-confined highlights keep faces, clothing and original lettering unobscured.
  const sparks: readonly (readonly [number, number])[] = [[.075, .17], [.918, .12], [.09, .67], [.917, .79], [.18, .91], [.82, .93], [.12, .34], [.89, .43]]
  return <svg className="lumaPremiumCardFinish" data-premium-finish={finish.tier} data-motif={finish.motif}
    data-active={active} data-reduced={reduced} data-edition-key={card.key}
    viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
    style={{ '--premium-light': finish.light, '--premium-mid': finish.mid, '--premium-deep': finish.deep } as CSSProperties}>
    <title>{label}</title>
    <defs>
      <linearGradient id={foilId} x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0" stopColor={finish.deep} /><stop offset=".24" stopColor={finish.light} />
        <stop offset=".46" stopColor={finish.mid} /><stop offset=".61" stopColor="#fff8e7" />
        <stop offset=".79" stopColor={finish.deep} /><stop offset="1" stopColor={finish.light} />
      </linearGradient>
      <pattern id={etchId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
        <path d="M0 0v9" stroke={finish.light} strokeWidth="1" opacity=".6" />
      </pattern>
    </defs>
    <rect className="lumaPremiumFoilRail" x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx="9" stroke={`url(#${foilId})`} />
    <rect className="lumaPremiumEtchedRail" x="21" y="21" width={width - 42} height={height - 42} rx="5" stroke={`url(#${etchId})`} />
    <path className="lumaPremiumCorner" d={`M${margin} 88V${margin}H111M${width - 111} ${margin}H${width - margin}V88M${margin} ${height - 88}V${height - margin}H111M${width - 111} ${height - margin}H${width - margin}V${height - 88}`} stroke={`url(#${foilId})`} />
    <g className="lumaPremiumMotif" transform={`translate(${center} ${margin + 10}) scale(.72)`}><Motif motif={finish.motif} /></g>
    {finish.tier === 'SSR' && <>
      <path className="lumaPremiumOrbit" d={`M${center - 85} 40q85-45 170 0-85 33-170 0ZM${center - 85} ${height - 40}q85-33 170 0-85 45-170 0Z`} stroke={`url(#${foilId})`} />
      <g className="lumaPremiumMotif is-lower" transform={`translate(${center} ${height - margin - 8}) scale(.58)`}><Motif motif={finish.motif} /></g>
    </>}
    <rect className="lumaPremiumMovingGlint" x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx="9" pathLength="100" />
    {sparks.slice(0, finish.tier === 'SSR' ? 8 : 5).map(([x, y], index) => <g key={index} className="lumaPremiumSpark" transform={`translate(${x * width} ${y * height})`} style={{ '--spark-delay': `${index * -.91}s` } as CSSProperties}>
      <path d="M-6 0q6-1 6-7 0 6 6 7-6 1-6 7 0-6-6-7Z" /><circle r="1.6" />
    </g>)}
  </svg>
}
