/* Adapt the frozen canvas#gl card engine to Luma's radian-based viewer protocol.
 * Loaded before the original bundle; artwork, shaders and authored craft stay intact. */
(() => {
  'use strict'
  const parts = location.pathname.split('/').filter(Boolean)
  const index = parts.indexOf('luma-card-viewers')
  const editionKey = `${parts[index + 1]}@${parts[index + 2]}`
  const canvas = document.getElementById('gl')
  // The authored renderer clears its canvas to charcoal every frame. Its
  // byte-verified original remains usable outside the embedded gallery.
  const context = canvas?.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' })
  if (context) {
    const clearColor = context.clearColor.bind(context)
    context.clearColor = (r, g, b, a) => {
      if (r === 0.031 && g === 0.039 && b === 0.051 && a === 1) clearColor(1, 1, 1, 1)
      else clearColor(r, g, b, a)
    }
  }
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  let ready = false, disposed = false, failed = false, poll, pointer, last
  let reduced = media.matches
  const scheduled = new Set()
  const requestFrame = window.requestAnimationFrame.bind(window)
  const cancelFrame = window.cancelAnimationFrame.bind(window)
  // The original engine has a perpetual render loop and no dispose API.
  // This document-local wrapper lets the host stop it before removing the iframe.
  window.requestAnimationFrame = callback => {
    if (disposed) return 0
    let id
    id = requestFrame(time => { scheduled.delete(id); if (!disposed) callback(time) })
    scheduled.add(id)
    return id
  }
  window.cancelAnimationFrame = id => { scheduled.delete(id); cancelFrame(id) }
  document.body.classList.add('luma-collection-embedded')
  if (canvas) { canvas.tabIndex = 0; canvas.setAttribute('aria-label', '拖动旋转卡牌，F翻面，R回正') }
  const notify = (state, detail = {}) => parent.postMessage({
    type: 'luma-card-viewer-state', editionKey, state, ...detail,
  }, location.origin)
  function current() {
    const p = window.__P
    return { yaw: p?.yaw ?? 0, pitch: p?.pitch ?? 0, back: Math.cos(p?.yaw ?? 0) < 0, reduced, disposed }
  }
  function pose(pitch, yaw) {
    if (!ready || disposed || !Number.isFinite(pitch) || !Number.isFinite(yaw)) return
    const p = window.__P
    p.pitch = Math.max(-.30, Math.min(.30, pitch)); p.yaw = yaw % (Math.PI * 2)
    p.still = true; p.reduced = reduced
    notify('ready', current())
  }
  function dispose() {
    if (disposed) return
    disposed = true; ready = false; clearTimeout(poll)
    for (const id of scheduled) cancelFrame(id)
    scheduled.clear(); media.removeEventListener('change', motion)
    if (pointer !== undefined && canvas?.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer)
    pointer = last = undefined
    const gl = canvas?.getContext('webgl2')
    if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  function fail() {
    if (disposed || failed) return
    failed = true; ready = false; notify('failed'); dispose()
  }
  function motion() {
    reduced = media.matches
    if (ready) pose(window.__P.pitch, window.__P.yaw)
  }
  media.addEventListener('change', motion)
  window.__lumaCardEmbed = { dispose, get ready() { return ready }, get state() { return current() }, engine: 'raw-webgl' }
  // Run before the bundle's older listener, whose angles are degrees and whose
  // readiness message has no pose. Handle commands once, in the host protocol.
  window.addEventListener('message', event => {
    if (!['luma-card-viewer-command', 'luma-card-viewer-dispose'].includes(event.data?.type)) return
    event.stopImmediatePropagation()
    if (event.origin !== location.origin || event.source !== parent || event.data.editionKey !== editionKey) return
    if (event.data.type === 'luma-card-viewer-dispose') { dispose(); return }
    if (!ready || disposed) return
    const p = window.__P, command = event.data.command
    if (command === 'front' || command === 'reset') pose(0, 0)
    else if (command === 'back') pose(0, Math.PI)
    else if (command === 'edge') pose(0, Math.PI / 2)
    else if (command === 'left') pose(p.pitch, p.yaw - Math.PI / 6)
    else if (command === 'right') pose(p.pitch, p.yaw + Math.PI / 6)
    else if (command === 'reduced' && typeof event.data.value === 'boolean') {
      reduced = event.data.value; pose(p.pitch, p.yaw)
    }
  }, true)
  canvas?.addEventListener('webglcontextlost', fail)
  canvas?.addEventListener('pointerdown', event => {
    if (!ready || disposed || event.button !== 0) return
    event.preventDefault(); event.stopImmediatePropagation()
    pointer = event.pointerId; last = [event.clientX, event.clientY]
    canvas.setPointerCapture(pointer); canvas.focus({ preventScroll: true })
  }, true)
  canvas?.addEventListener('pointermove', event => {
    if (!ready || disposed || event.pointerId !== pointer || !last) return
    event.preventDefault(); event.stopImmediatePropagation()
    pose(window.__P.pitch + (event.clientY - last[1]) * .003,
      window.__P.yaw + (event.clientX - last[0]) * Math.PI * 2 / Math.max(200, canvas.clientWidth))
    last = [event.clientX, event.clientY]
  }, true)
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas?.addEventListener(name, event => {
    if (event.pointerId !== pointer) return
    event.stopImmediatePropagation()
    pointer = last = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }, true)
  canvas?.addEventListener('dblclick', event => {
    if (!ready) return
    event.preventDefault(); event.stopImmediatePropagation(); pose(0, 0)
  }, true)
  canvas?.addEventListener('keydown', event => {
    const key = event.key.toLowerCase()
    if (key === 'escape') { event.preventDefault(); event.stopImmediatePropagation(); notify('close-requested'); return }
    if (!ready || !['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'f', 'r', 'home'].includes(key)) return
    event.preventDefault(); event.stopImmediatePropagation()
    const p = window.__P
    if (key === 'f') pose(0, Math.cos(p.yaw) < 0 ? 0 : Math.PI)
    else if (key === 'r' || key === 'home') pose(0, 0)
    else pose(p.pitch + (key === 'arrowup' ? -.06 : key === 'arrowdown' ? .06 : 0),
      p.yaw + (key === 'arrowleft' ? -.12 : key === 'arrowright' ? .12 : 0))
  }, true)
  window.addEventListener('pagehide', dispose)
  const started = performance.now()
  function check() {
    if (disposed) return
    if (!canvas || window.__ERR) { fail(); return }
    if (window.__READY && window.__P) {
      const gl = canvas.getContext('webgl2'), program = gl?.getParameter(gl.CURRENT_PROGRAM)
      if (!gl || gl.isContextLost() || !program || !gl.getProgramParameter(program, gl.LINK_STATUS)
        || !gl.getAttachedShaders(program).every(shader => gl.getShaderParameter(shader, gl.COMPILE_STATUS))) { fail(); return }
      ready = true; pose(0, 0); return
    }
    if (performance.now() - started > 25000) { fail(); return }
    poll = setTimeout(check, 100)
  }
  check()
})()
