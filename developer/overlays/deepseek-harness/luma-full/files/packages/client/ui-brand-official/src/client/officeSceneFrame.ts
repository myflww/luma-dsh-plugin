
export function requestSceneFrame(callback: FrameRequestCallback): number {
  return typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16)
}

export function cancelSceneFrame(frameId: number): void {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameId)
  else window.clearTimeout(frameId)
}

