import { createDesktopSettings } from './bridge-settings.ts'
import { createDesktopSessions } from './bridge-sessions.mjs'

/** Built only for the Electron plugin. The portable entry continues using its own SDK. */
export function createDesktopContext(ctx: Parameters<typeof createDesktopSessions>[0]) {
  const native = createDesktopSessions(ctx)
  const settings = createDesktopSettings()
  const connection = { api: { ...native.api, settings: settings.api } }
  return { context: { sessions: native.sessions, workspaces: native.workspaces, settingsScope: { bind: settings.bind },
      uploadSessionFile: native.uploadSessionFile,
      get(name: string) { return name === 'connection' ? connection : ctx.get(name) },
      openNativeSession: native.openNativeSession },
    dispose() { native.dispose(); settings.dispose() } }
}
