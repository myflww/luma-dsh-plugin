import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as JSX from 'react/jsx-runtime'

test('desktop registers an opt-in native panel, leaves the default conversation open and returns on unload', async () => {
  const source = await readFile(new URL('../.runtime/native-desktop/client.mjs', import.meta.url), 'utf8')
  let entry
  const window = { __ModuleLoader__: { load: value => { entry = value } } }
  runInNewContext(source, { window, console, URL, URLSearchParams, TextEncoder, TextDecoder, clearTimeout, setTimeout })
  assert.equal(entry.id, '@luma/dsh-plugin')
  const modules = {
    react: React, 'react-dom': ReactDOM, 'react/jsx-runtime': JSX,
    '@deepseek-ai/dsh-client-ui-primitives': { IconSparkleRegular: () => null, IconFolderCloseRegular: () => null },
  }
  const client = entry.factory(id => { assert.ok(id in modules, 'unexpected runtime import ' + id); return modules[id] })
  const entries = new Map()
  const selected = []
  const disposers = []
  let activePanelId = null
  const ctx = {
    slots: {
      inject: (_name, activate) => activate(),
      register: (spec, Component) => { entries.set(spec.name, { spec, Component }); return () => {} },
    },
    layout: {
      panelInfo: { getSnapshot: () => ({ activePanelId }) },
      selectPanel(id) { activePanelId = id; selected.push(id) },
    },
    effect: activate => { disposers.push(activate()) },
  }
  client.apply(ctx)
  assert.deepEqual([...entries.keys()], ['main', 'sidebar.panellist'])
  assert.deepEqual(selected, [])
  const main = entries.get('main').spec
  const sidebar = entries.get('sidebar.panellist').spec
  assert.equal(sidebar.id, main.key)
  assert.equal(sidebar.label(), 'Luma 办公室')
  ctx.layout.selectPanel(sidebar.id)
  main.inject().onReturnToDSH()
  assert.deepEqual(selected, ['luma-office', null])
  ctx.layout.selectPanel(sidebar.id)
  for (const dispose of disposers) dispose()
  assert.equal(activePanelId, null)
})
