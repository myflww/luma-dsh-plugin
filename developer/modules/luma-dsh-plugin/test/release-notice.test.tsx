import { afterEach,expect,it,vi } from 'vitest'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { ReleaseNotice,ReleaseSettings,useReleaseCheck } from '../src/client/ReleaseCenter.tsx'

function InstalledPanel(){
  const state=useReleaseCheck()
  return <><ReleaseNotice state={state}/><ReleaseSettings state={state}/></>
}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('announces a newer private release, skips only that version and keeps a working manual check',async()=>{
  let skipped=false,latest='v0.5.3'
  const fetcher=vi.fn(async(path:string)=>{
    if(path.includes('action=skip'))skipped=true
    return {ok:true,json:async()=>({installed:'0.5.2',host:'0.2.2-rc.5',latest,available:true,
      dismissed:skipped,checked:1,problem:'',url:'https://github.com/myflww/luma-dsh-plugin/releases/tag/'+latest})}
  })
  vi.stubGlobal('fetch',fetcher)
  render(<InstalledPanel/>)
  expect(await screen.findByRole('heading',{name:'Luma 有新版本'})).toBeTruthy()
  expect(screen.getByRole('link',{name:'查看更新'}).getAttribute('href')).toContain('/tag/v0.5.3')
  fireEvent.click(screen.getByRole('button',{name:'跳过此版'}))
  await waitFor(()=>expect(screen.queryByRole('heading',{name:'Luma 有新版本'})).toBeNull())
  latest='v0.5.4';skipped=false
  fireEvent.click(screen.getByRole('button',{name:'检查更新'}))
  expect(await screen.findByRole('link',{name:'查看更新'})).toBeTruthy()
  expect(screen.getByRole('link',{name:'查看更新'}).getAttribute('href')).toContain('/tag/v0.5.4')
})
