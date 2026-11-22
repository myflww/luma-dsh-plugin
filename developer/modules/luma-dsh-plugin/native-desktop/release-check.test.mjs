import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { releaseChecker, newer } from './release-check.ts'
test('private release discovery deduplicates, defers, skips per tag and recovers after a network failure',async()=>{
  const db=new DatabaseSync(':memory:')
  try{
    let time=1e9,calls=0,tag='v0.6.0'
    const service=releaseChecker(db,async()=>{calls++;if(!tag)throw Error();return tag},()=>time,async()=>'0.2.2-rc.5')
    const results=await Promise.all([service.check('auto'),service.check('auto')])
    assert.equal(calls,1)
    assert.ok(results.every(result=>result.available && !result.dismissed && result.host==='0.2.2-rc.5'))
    await service.check('skip',tag)
    assert.equal((await service.check('auto')).dismissed,true)
    time+=86400000; tag=''
    assert.ok((await service.check('auto')).problem)
    tag='v0.6.1'
    assert.ok((await service.check('auto')).problem)
    assert.equal((await service.check('check')).dismissed,false)
    assert.equal(newer('v0.5.10','0.5.2'),true)
    assert.equal(newer('v1.0.0-alpha.9','0.5.2'),false)
    await assert.rejects(service.check('skip','v0.6.0'))
    service.close()
  }finally{db.close()}
})
