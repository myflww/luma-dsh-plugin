// Desktop 0.2.2-rc.1 mounts a shared layout store on the root slot. Its
// create() returns the active AppFrame instance (including the user's width).
const COMPACT_WIDTH = 1024

export function getHostSidebar(ctx) {
  const frame = ctx.slots?.entries?.('root')?.find(entry => entry.children?.['sidebar'] && entry.children?.['main'])
  const store = frame?.store?.create?.()
  if (!store?.getSnapshot?.()?.layoutInfo || typeof store.subscribe !== 'function' || typeof store.actions?.setSidebar !== 'function' ||
      typeof ctx.layout?.toggleSidebar !== 'function') return undefined

  const read = () => store.getSnapshot().layoutInfo
  const small = info => info.viewportWidth < COMPACT_WIDTH
  const collapsed = info => small(info) ? !info.narrowExpanded : info.sidebar === 0
  const toggle = () => ctx.layout.toggleSidebar()
  let exit
  return {
    getSnapshot: () => collapsed(read()),
    subscribe: listener => store.subscribe(listener),
    toggle,
    enter() {
      exit?.()
      let previous = read()
      let restoreWidth
      let restoreDrawer = false
      let manuallyOpenedWide = false
      let folding = false
      const hide = () => {
        const info = read()
        if (collapsed(info)) return
        if (small(info)) restoreDrawer = true
        else restoreWidth = info.sidebar
        folding = true
        try { toggle() } finally { folding = false; previous = read() }
      }
      hide()
      // Preserve explicit changes from DSH shortcuts, drag handles, or the
      // scene menu. Compact drawers and wide columns have independent state.
      const unsubscribe = store.subscribe(() => {
        const info = read()
        if (folding) return
        const widened = small(previous) && !small(info)
        if (previous.sidebar !== info.sidebar) restoreWidth = undefined
        if (previous.narrowExpanded !== info.narrowExpanded || small(previous) !== small(info)) restoreDrawer = false
        previous = info
        if (widened && !collapsed(info) && !manuallyOpenedWide) {
          // The initial compact layout can be closed while the saved wide
          // preference is open. Fold it when the window first grows.
          hide()
        } else if (!small(info) && !collapsed(info)) manuallyOpenedWide = true
      })
      const leave = () => {
        if (exit !== leave) return
        exit = undefined
        unsubscribe()
        if (restoreWidth !== undefined && read().sidebar === 0) store.actions.setSidebar(restoreWidth)
        if (restoreDrawer && small(read()) && collapsed(read())) toggle()
      }
      exit = leave
      return leave
    },
    dispose: () => exit?.(),
  }
}
