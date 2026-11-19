import { Component, createElement as h, useEffect, useLayoutEffect, useState } from 'react'
import { IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { PluginShell } from '../src/client/PluginShell.tsx'
import { createOfficePageRuntime } from '../src/client/office-runtime.ts'
import { createCardsPageRuntime } from '../src/client/CardsPage.tsx'
import { createLocalCollectionRuntime } from '../src/client/local-collection-store.ts'
import { createMessagesRuntime } from '../src/client/messages-runtime.ts'
import { createPluginPreferencesRuntime } from '../src/client/plugin-backup-runtime.ts'
import { createDesktopContext } from './context.ts'
import { mountDesktopStyles } from './client-styles.mjs'
import './client.css'

const PANEL_ID = 'luma-office'
export const inject = ['slots', 'layout', 'sessions', 'workspaces', 'connection', 'remote', 'remote.settings', 'remoteAccess',
  'uiConversation', 'uiSession', 'uiWorkspace', 'remote.session', 'remote.agentPresets', 'remote.workspace']

function ReturnNotice({ message, onReturnToDSH }) {
  return h('section', { className: 'lumaDesktopNotice', role: 'alert' },
    h('h2', null, 'Luma 暂时无法打开'), h('p', null, message),
    h('button', { type: 'button', onClick: onReturnToDSH }, '返回 DSH'))
}

class PanelBoundary extends Component {
  state = { error: undefined }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    return this.state.error
      ? h(ReturnNotice, { message: String(this.state.error.message ?? this.state.error), onReturnToDSH: this.props.onReturnToDSH })
      : this.props.children
  }
}

function NativePanel({ load, onReturnToDSH }) {
  const [state, setState] = useState({})
  const [navigationError, setNavigationError] = useState('')
  useLayoutEffect(mountDesktopStyles, [])
  useEffect(() => {
    try { setState({ runtimes: load() }) }
    catch (error) { setState({ failure: error instanceof Error ? error.message : String(error) }) }
  }, [load])
  let content
  if (state.failure) content = h(ReturnNotice, { message: state.failure, onReturnToDSH })
  else if (state.runtimes) {
    async function openConversation() {
      try { await state.runtimes.openNativeConversation(); onReturnToDSH() }
      catch (error) { setNavigationError(error instanceof Error ? error.message : String(error)) }
    }
    content = h(PanelBoundary, { onReturnToDSH }, h(PluginShell, {
      ...state.runtimes, onReturnToDSH, onOpenConversation: openConversation,
    }))
  }
  else content = h('p', { role: 'status', className: 'lumaDesktopNotice' }, '正在打开办公室…')
  return h('div', { className: 'lumaDesktopPanel', 'data-luma-native-panel': PANEL_ID }, content,
    navigationError && h('div', { className: 'lumaDesktopError', role: 'alert' }, navigationError,
      h('button', { type: 'button', onClick: () => setNavigationError('') }, '关闭')))
}

/** Retain the domain runtimes while DSH switches panels; dispose them with the plugin. */
export function apply(ctx) {
  const owned = []
  let runtimes
  function dispose() {
    for (const item of owned.splice(0).reverse()) item.dispose()
    runtimes = undefined
  }
  function own(value) { owned.push(value); return value }
  function load() {
    if (runtimes) return runtimes
    try {
      const { context } = own(createDesktopContext(ctx))
      const office = own(createOfficePageRuntime(context))
      const cards = own(createCardsPageRuntime(context))
      const collection = own(createLocalCollectionRuntime(context))
      const messages = own(createMessagesRuntime(context, office))
      const preferences = own(createPluginPreferencesRuntime(context))
      runtimes = { office, cards, collection, messages, preferences,
        openNativeConversation: () => context.openNativeSession?.(),
      }
      return runtimes
    } catch (error) { dispose(); throw error }
  }
  const onReturnToDSH = () => ctx.layout.selectPanel(null)
  ctx.effect(() => () => {
    try {
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) onReturnToDSH()
    } finally { dispose() }
  }, 'Luma desktop panel lifecycle')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, inject: () => ({ load, onReturnToDSH }),
  }, NativePanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 5, label: () => 'Luma 办公室',
  }, ({ size }) => h(IconSparkleRegular, { size })))
}
