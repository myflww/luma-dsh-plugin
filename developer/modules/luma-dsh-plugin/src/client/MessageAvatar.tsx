import './MessageAvatar.css'

export interface MessageAvatarViewport {
  readonly width: number
  readonly height: number
  readonly x: number
  readonly y: number
  readonly size: number
}

/** A calibrated head-and-shoulders window over an authored, front-facing sprite. */
export function MessageAvatar({ src, viewport }: { src: string; viewport?: MessageAvatarViewport | undefined }) {
  return <span className="lumaMessageAvatar" aria-hidden="true" data-portrait-viewport={viewport ? 'true' : undefined}>
    <img src={src} alt="" {...viewport ? { style: {
      position: 'absolute' as const, maxWidth: 'none', borderRadius: 0, background: 'transparent',
      width: `${viewport.width / viewport.size * 100}%`, height: `${viewport.height / viewport.size * 100}%`,
      left: `${-viewport.x / viewport.size * 100}%`, top: `${-viewport.y / viewport.size * 100}%`,
    } } : {}} />
  </span>
}
