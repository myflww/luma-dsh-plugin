import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LoveHouseQuickConnect } from '../src/client/LoveHouseQuickConnect.tsx'
import { agentRequest } from '../src/client/agent-desk-api.ts'

vi.mock('../src/client/agent-desk-api.ts',()=>({agentRequest:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})

it('shows the detected launcher, retries a failed connection, and displays the actual service version',async()=>{
  const offline={status:'offline',bound:8,verified:0,total:8,pending:2,launchVersion:'0.10.7rc1'}
  vi.mocked(agentRequest).mockResolvedValueOnce(offline)
    .mockRejectedValueOnce(Error('请先打开原来的数据目录。'))
    .mockResolvedValueOnce({...offline,status:'connected',verified:8,pending:0,version:'0.10.6rc1',protocol:'0.4.0'})
  const close=vi.fn()
  render(<LoveHouseQuickConnect onClose={close}/>)
  expect(await screen.findByRole('dialog',{name:'爱之屋'})).toBeTruthy()
  fireEvent.click(await screen.findByRole('button',{name:'启动并连接'}))
  expect((await screen.findByRole('alert')).textContent).toMatch(/原来的数据目录/)
  fireEvent.click(screen.getByRole('button',{name:'启动并连接'}))
  expect(await screen.findByText('已核对 8 个独立角色库。')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toMatch(/爱之屋 0.10.6rc1/)
  expect(screen.getByText(/请先退出当前运行的爱之屋/)).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'关闭爱之屋连接'}))
  expect(close).toHaveBeenCalledOnce()
})

it('supports a verified custom data directory in the standalone settings panel',async()=>{
  const dataDir='E:/LoveHouse/data'
  const result={status:'connected',bound:8,verified:8,total:8,pending:0,directory:dataDir}
  vi.mocked(agentRequest).mockResolvedValueOnce({...result,directory:undefined,status:'offline'}).mockResolvedValueOnce(result)
  render(<LoveHouseQuickConnect/>)
  await screen.findByText('离线')
  fireEvent.click(screen.getByText('其他数据目录'))
  const directory=screen.getByRole('textbox',{name:'爱之屋数据文件夹'}) as HTMLInputElement
  fireEvent.change(directory,{target:{value:dataDir}})
  fireEvent.click(screen.getByRole('button',{name:'核验并连接此目录'}))
  await screen.findByText('已连接')
  expect(agentRequest).toHaveBeenLastCalledWith('houseconnect',{directory:dataDir},expect.anything())
  expect(directory.value).toBe(dataDir)
})
