import z from '@deepseek-ai/schemastery'

export const PLUGIN_PREFERENCES_NAMESPACE = 'luma-dsh-plugin-preferences'
export type PluginMotionPreference = 'system' | 'reduce'
export interface PluginPreferences { readonly schemaVersion: 1; readonly reducedMotion: PluginMotionPreference }
export interface PluginPreferencesSettings { readonly preferences?: PluginPreferences }
export const DEFAULT_PLUGIN_PREFERENCES: PluginPreferences = Object.freeze({ schemaVersion: 1, reducedMotion: 'system' })
export const PluginPreferencesSettingsSchema = z.dict(z.any().required(), z.string().pattern(/^preferences$/u)).default({})

export function decodePluginPreferencesSettings(value: unknown): PluginPreferencesSettings | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'preferences')) return
  const raw = (value as Record<string, unknown>).preferences
  if (raw === undefined) return Object.freeze({})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
  const p = raw as Record<string, unknown>
  if (Object.keys(p).sort().join(',') !== 'reducedMotion,schemaVersion' || p.schemaVersion !== 1
    || p.reducedMotion !== 'system' && p.reducedMotion !== 'reduce') return
  return Object.freeze({ preferences: Object.freeze({ schemaVersion: 1, reducedMotion: p.reducedMotion }) })
}
export function validatePluginPreferencesSettingsWire(value: unknown): void {
  if (!decodePluginPreferencesSettings(value)) throw new Error('插件偏好设置版本不受支持，原记录已保留。')
}
