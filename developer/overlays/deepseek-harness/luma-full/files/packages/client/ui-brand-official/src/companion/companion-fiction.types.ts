export interface CompanionLore {
  readonly id: number
  readonly title: string
  readonly keys: readonly string[]
  readonly content: string
  readonly constant: boolean
  readonly priority: number
}

export interface CompanionFiction {
  readonly origin: Readonly<{ kind: 'luma-original' | 'internet-adaptation'; source: string }>
  readonly age: number
  readonly occupation: string
  /** Concise profile/catalog copy only; never a task prompt or capability. */
  readonly presentation: Readonly<{ pitch: string; tags: readonly string[] }>
  readonly background: readonly string[]
  readonly personality: readonly string[]
  readonly voice: readonly string[]
  readonly emotion: string
  readonly relationship: string
  readonly greeting: string
  readonly examples: readonly string[]
  readonly ambient: Readonly<{ idle: readonly string[]; rest: readonly string[] }>
  readonly lore: readonly CompanionLore[]
}
