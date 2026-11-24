import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { releaseChecker, newer } from './release-check.ts'
import manifest from './manifest.json' with { type: 'json' }
test('private release discovery deduplicates, defers, skips per tag and recovers after a network failure',async()=>{
  const db=new DatabaseSync(':memory:')
  try{
    const [major,minor,patch] = manifest.version.split('.').map(Number)
    const first = 'v'+[major, minor, patch+1].join('.')
    let time=1e9,calls=0,tag=first
    const service=releaseChecker(db,async()=>{calls++;if(!tag)throw Error();return tag},()=>time,async()=>'0.2.2-rc.5')
    const results=await Promise.all([service.check('auto'),service.check('auto')])
    assert.equal(calls,1)
    assert.ok(results.every(result=>result.available && !result.dismissed && result.host==='0.2.2-rc.5'))
    await service.check('skip',tag)
    assert.equal((await service.check('auto')).dismissed,true)
    time+=86400000; tag=''
    assert.ok((await service.check('auto')).problem)
    tag='v'+[major, minor, patch+2].join('.')
    assert.ok((await service.check('auto')).problem)
    assert.equal((await service.check('check')).dismissed,false)
    assert.equal(newer('v0.5.10','0.5.2'),true)
    assert.equal(newer('v1.0.0-alpha.9','0.5.2'),false)
    await assert.rejects(service.check('skip',first))
    service.close()
  }finally{db.close()}
})
