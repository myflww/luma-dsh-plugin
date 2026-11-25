import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlookInboxAttachment } from '../src/client/OutlookInboxAttachment.tsx'
import { parseOutlookPreview } from '../src/host/outlook-inbox.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const first = { subject:'会议', sender:'小林', unread:true, received:'2026-11-25T03:00:00Z' }
const second = { ...first, subject:'计划', sender:'小江', unread:false }
const fixture = (headers:object[])=>({ok:true,json:async()=>({ok:true,value:{headers}})})

it('projects only bounded mail headers and normalizes metadata from the helper',()=>{
  const headers = Array.from({length:21},()=>({...first, subject:'  会\n议 ', body:'private body', email:'private address'}))
  const parsed = parseOutlookPreview(JSON.stringify({headers}))
  expect(parsed.headers).toHaveLength(20)
  expect(parsed.headers[0]).toEqual({subject:'会 议', sender:'小林', unread:true, received:'2026-11-25T03:00:00.000Z'})
  expect(()=>parseOutlookPreview(JSON.stringify({headers:[{...first,unread:'false'}]}))).toThrow()
  expect(parseOutlookPreview('{"headers":[]}')).toEqual({headers:[]})
})

it('reads on click, previews, then copies only the checked headers to the draft', async()=>{
  const fetcher=vi.fn(async()=>fixture([first,second]))
  vi.stubGlobal('fetch',fetcher)
  const attach=vi.fn(),close=vi.fn()
  render(<OutlookInboxAttachment roleId="jingyuniang" onAttach={attach} onClose={close}/>)
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'读取最近 20 封'}))
  const picks=await screen.findAllByRole('checkbox')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledWith('/luma-agents/outlookinbox',expect.objectContaining({body:'{"roleId":"jingyuniang"}'}))
  expect(attach).not.toHaveBeenCalled()
  expect((screen.getByRole('button',{name:/加入草稿/}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(picks[1]!)
  fireEvent.click(screen.getByRole('button',{name:/加入草稿/}))
  expect(attach).toHaveBeenCalledTimes(1)
  expect(attach.mock.calls[0]![0]).toContain('小江 · 计划')
  expect(attach.mock.calls[0]![0]).not.toContain('会议')
  expect(close).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('reports unsupported Outlook and allows retry without attaching anything',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({ok:false,error:'未检测到经典 Outlook。'})})
    .mockResolvedValueOnce(fixture([]))
  vi.stubGlobal('fetch',fetcher)
  const attach=vi.fn()
  render(<OutlookInboxAttachment roleId="shan" onAttach={attach}/>)
  fireEvent.click(screen.getByRole('button',{name:'读取最近 20 封'}))
  expect((await screen.findByRole('alert')).textContent).toContain('未检测到经典 Outlook。')
  fireEvent.click(screen.getByRole('button',{name:'重新读取'}))
  expect((await screen.findByRole('status')).textContent).toContain('没有邮件')
  expect(attach).not.toHaveBeenCalled()
})
