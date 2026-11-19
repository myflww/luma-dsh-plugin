import z from '@deepseek-ai/schemastery'
export { validateLocalCollectionSettings, decodeLocalCollectionSettings } from './shared/local-collection-domain.ts'
export type { LocalCollectionSettings } from './shared/local-collection-domain.ts'
export const LOCAL_COLLECTION_SETTINGS_NAMESPACE = 'luma-dsh-local-collection'
/** Semantic replay validates every atomic event before the Host commits this field. */
export const LocalCollectionSettingsSchema = z.object({ state: z.any() }).default({ state: undefined })
