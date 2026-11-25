import test from 'node:test'
import assert from 'node:assert/strict'
import {SourceMap} from 'node:module'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import vm from 'node:vm'
import {build} from 'esbuild'
import {nativeBundleOptions} from '../scripts/native-bundle-options.mjs'

test('native bundles omit machine-specific source labels while preserving license, string data and mappings',async t=>{
  const cwd=await mkdtemp(join(tmpdir(),'luma-printer-'))
  t.after(()=>rm(cwd,{recursive:true,force:true}))
  const filename='private-build-location/input.js'
  const literal='/* license-looking text */\n// local-looking/path.js'
  const source='/*! Copyright Fixture – MIT License */\nexport function actualValue() {\n  return '+JSON.stringify(literal)+'\n}'
  const options={absWorkingDir:cwd,stdin:{sourcefile:filename,contents:source,resolveDir:cwd},
    outfile:join(cwd,'bundle.js'),bundle:true,format:'cjs',platform:'node',target:'es2022',sourcemap:'external',write:false,
    logLevel:'silent'}
  const plain=await build(options)
  assert.ok(plain.outputFiles.find(f=>f.path.endsWith('.js')).text.includes('// '+filename))
  const output=await build({...options,...nativeBundleOptions})
  const js=output.outputFiles.find(f=>f.path.endsWith('.js')).text
  assert.ok(!js.includes(filename))
  assert.match(js,/Copyright Fixture – MIT License/)
  const module={exports:{}}
  vm.runInNewContext(js,{module})
  assert.equal(module.exports.actualValue(),literal)
  const mapping=JSON.parse(output.outputFiles.find(f=>f.path.endsWith('.map')).text)
  assert.deepEqual(mapping.sourcesContent,[source])
  const offset=js.lastIndexOf('return')
  assert.ok(offset>=0)
  const before=js.slice(0,offset).split('\n')
  const entry=new SourceMap(mapping).findEntry(before.length-1,before.at(-1).length)
  assert.equal(entry.originalLine,2)
  assert.ok(entry.originalSource.endsWith(filename))
})
