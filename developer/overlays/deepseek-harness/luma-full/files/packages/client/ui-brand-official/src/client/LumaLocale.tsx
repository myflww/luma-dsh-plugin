import { createContext, useContext } from 'react'

export type LumaLanguage = 'zh' | 'en'
export interface LumaLocaleSource {
  getSnapshot(): { readonly active: string }
  subscribe(listener: () => void): () => void
}
export const LumaLocaleContext = createContext<LumaLanguage>('zh')
export const useLumaLanguage = (): LumaLanguage => useContext(LumaLocaleContext)
export const useLumaText = (): ((chinese: string, english: string) => string) => {
  const language = useLumaLanguage()
  return (chinese, english) => language === 'en' ? english : chinese
}
