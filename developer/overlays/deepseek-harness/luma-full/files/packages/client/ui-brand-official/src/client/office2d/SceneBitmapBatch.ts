export interface SceneBitmap { close(): void }
export type SceneBitmapDecoder<T extends SceneBitmap> = (src: string, sha256: string, signal: AbortSignal) => Promise<T>

/** A complete verified image read belongs to one render-effect generation. */
export class SceneBitmapBatch<T extends SceneBitmap> {
  readonly images = new Map<string, T>()
  private readonly abort = new AbortController()
  private readonly owned = new Set<T>()
  private closed = false
  private started = false

  constructor(private readonly decode: SceneBitmapDecoder<T>, private readonly reportReleaseFailure: (count: number) => unknown = () => undefined) {}

  async load(sources: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, T>> {
    if (this.closed || this.started) throw new Error('Scene bitmap batch is no longer available')
    this.started = true
    try {
      await Promise.all(Array.from(sources, async ([src, hash]) => {
        const image = await this.decode(src, hash, this.abort.signal)
        if (this.closed) { this.closeImages([image]); return }
        this.owned.add(image)
        this.images.set(src, image)
      }))
      if (this.closed) throw new Error('Scene bitmap batch was released')
      return this.images
    } catch (error) { this.release(); throw error }
  }

  private closeImages(images: Iterable<T>): void {
    let failures = 0
    for (const image of images) { try { image.close() } catch { failures++ } }
    if (failures) {
      try {
        const pending = this.reportReleaseFailure(failures)
        if (pending !== null && (typeof pending === 'object' || typeof pending === 'function') && typeof (pending as { then?: unknown }).then === 'function') {
          void Promise.resolve(pending).catch(() => undefined)
        }
      } catch { /* Reporting never interrupts remaining release work. */ }
    }
  }

  release(): void {
    if (this.closed) return
    this.closed = true
    // Abort and bitmap release are separate steps: one native failure cannot
    // retain every decoded bitmap. Late decodes close themselves above.
    try { this.abort.abort() } catch { /* Decoded images still need release. */ }
    const images = [...this.owned]
    this.owned.clear()
    this.images.clear()
    this.closeImages(images)
  }
}
