import z from '@deepseek-ai/schemastery'
export { validateLocalCollectionSettings, decodeLocalCollectionSettings } from './shared/local-collection-domain.ts'
export type { LocalCollectionSettings } from './shared/local-collection-domain.ts'
export { LOCAL_COLLECTION_SETTINGS_NAMESPACE } from './shared/local-collection-domain.ts'
/** Semantic replay validates every atomic event before the Host commits this field. */
export const LocalCollectionSettingsSchema = z.object({ state: z.any() }).default({ state: undefined })
