import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { OfficePaperPlane } from '../src/client/OfficePaperPlane.tsx'

const crew=[{id:'jingyuniang',name:'鲸鱼娘',availability:'available' as const},{id:'grok',name:'绯洛',availability:'working' as const}]
function Room({active=true,reduce=false,present=crew}:{active?:boolean;reduce?:boolean;present?:typeof crew}){
  const [dock,setDock]=useState<HTMLDivElement|null>(null)
  return <><div ref={setDock}/><OfficePaperPlane active={active} reduceMotion={reduce} actors={present} room={null} toolbar={dock}>
    {pick=><>{present.map(a=><button key={a.id} onClick={()=>pick?.(a.id,{x:100,y:80})}>{pick?'把纸飞机递给':'联系'}{a.name}</button>)}</>}
  </OfficePaperPlane></>
}
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}))
afterEach(()=>{cleanup();vi.useRealTimers()})

it('carries each distinct stamp along the relay and lets a busy recipient answer briefly',()=>{
  vi.useFakeTimers()
  render(<Room/>)
  click('纸飞机');click('把纸飞机递给鲸鱼娘')
  expect(screen.queryByText('鲸鱼娘的回笺')).toBeNull()
  act(()=>vi.advanceTimersByTime(650))
  expect(screen.getByRole('img',{name:'浪花章'})).toBeTruthy()
  click('再传一位');click('把纸飞机递给绯洛')
  act(()=>vi.advanceTimersByTime(650))
  expect(screen.getByText(/又接着忙手头的事/)).toBeTruthy()
  expect(screen.getAllByRole('img')).toHaveLength(2)
  click('把纸飞机递给绯洛');act(()=>vi.advanceTimersByTime(650))
  expect(screen.getAllByRole('img')).toHaveLength(2)
  click('收回纸飞机')
  expect(screen.getByRole('button',{name:'联系绯洛'})).toBeTruthy()
})
it('uses an immediate reply with reduced motion and clears a letter if its recipient leaves',()=>{
  const room=render(<Room reduce/>)
  click('纸飞机');click('把纸飞机递给鲸鱼娘')
  expect(screen.getByText('鲸鱼娘的回笺')).toBeTruthy()
  room.rerender(<Room present={[crew[1]!]} reduce/>)
  expect(screen.queryByText('鲸鱼娘的回笺')).toBeNull()
  expect(screen.getByRole('button',{name:'联系绯洛'})).toBeTruthy()
})
it('cancels a flying plane when the scene is covered and never delivers a late reply',()=>{
  vi.useFakeTimers()
  const room=render(<Room/>)
  click('纸飞机');click('把纸飞机递给鲸鱼娘')
  room.rerender(<Room active={false}/>)
  act(()=>vi.advanceTimersByTime(800))
  room.rerender(<Room/>)
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByRole('button',{name:'纸飞机'}).getAttribute('aria-pressed')).toBe('false')
})
