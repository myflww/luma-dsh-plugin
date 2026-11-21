import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getHostSidebar } from './host-sidebar.mjs'

function layoutAt(width, sidebar = 337, narrowExpanded = false) {
  let info = { viewportWidth:width, sidebar, narrowExpanded }
  const listeners = new Set()
  const set = patch => {
    info = {...info,...patch}
    for (const listener of [...listeners]) listener()
  }
  const store = {
    getSnapshot: () => ({layoutInfo:info}),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    actions: { setSidebar: sidebar => set({sidebar}) },
  }
  const toggleSidebar = () => info.viewportWidth < 1024
    ? set({narrowExpanded:!info.narrowExpanded}) : set({sidebar:info.sidebar === 0 ? 280 : 0})
  return { bridge:getHostSidebar({ layout:{toggleSidebar}, slots:{entries:() => [
    {children:{sidebar:{},main:{}},store:{create:()=>store}},
  ]} }), info:()=>info, toggleSidebar,
  resize: next => set({ viewportWidth:next, narrowExpanded:false }), listeners }
}

test('entering and leaving DSH restores the exact open width without changing a closed preference', () => {
  for (const px of [337, 0]) {
    const {bridge,info,listeners} = layoutAt(1500,px)
    const leave = bridge.enter()
    assert.equal(bridge.getSnapshot(),true)
    bridge.dispose(); leave()
    assert.equal(info().sidebar,px)
    assert.equal(listeners.size,0)
    const exit = bridge.enter(); exit()
    assert.equal(info().sidebar,px)
  }
})

test('manual changes via Luma and the DSH titlebar are observed and respected on return', () => {
  const {bridge,info,toggleSidebar} = layoutAt(1450)
  const changes = []
  const unsub = bridge.subscribe(()=>changes.push(bridge.getSnapshot()))
  bridge.enter()
  toggleSidebar()
  bridge.toggle()
  bridge.dispose(); unsub()
  assert.equal(info().sidebar,0)
  assert.deepEqual(changes,[true,false,true])
})

test('responsive width changes preserve independent desktop and compact drawer settings', () => {
  const {bridge,info,resize} = layoutAt(600,390,true)
  let leave = bridge.enter()
  assert.equal(bridge.getSnapshot(),true)
  leave()
  assert.equal(info().narrowExpanded,true)
  leave = bridge.enter()
  resize(1400)
  assert.equal(bridge.getSnapshot(),true)
  resize(600)
  leave()
  assert.deepEqual(info(),{viewportWidth:600,sidebar:390,narrowExpanded:false})
})
