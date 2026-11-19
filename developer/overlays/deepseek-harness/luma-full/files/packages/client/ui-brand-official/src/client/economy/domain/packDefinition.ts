import type { PackSlotKind } from './types'

export type PackDefinition = {
  readonly id: string; readonly name: string; readonly description: string;
  readonly priceCny: number; readonly priceCrystals: number; readonly cardCount: number;
  readonly artworkUrl: string; readonly slots: readonly { kind: PackSlotKind; count: number }[];
  readonly series: readonly string[];
  readonly character?: string; readonly allowCny?: boolean;
  /** Historical definitions remain openable for purchased sealed packs, but cannot be sold. */
  readonly retired?: boolean;
};
