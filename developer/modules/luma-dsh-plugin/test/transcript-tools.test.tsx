import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { ReplyToolsProvider, ReplyTools, replyKey } from '../src/client/ReplyTools.tsx'
import { TranscriptFrame } from '../src/client/TurnNavigator.tsx'
import { DEFAULT_MESSAGE_PREFERENCES, decodeMessageSettings } from '../src/messages-settings.ts'

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('uses local message identity for feedback, copies exact text and exposes export via keyboard',async()=>{
  const key=replyKey('native','session-1','turn-2')
  const writeText=vi.fn(async()=>{})
  Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true})
  function Surface(){
    const [ratings,setRatings]=useState<Record<string,'up'|'down'>>({})
    return <ReplyToolsProvider reactions={ratings} rate={async(id,value)=>{const next={...ratings};if(next[id]===value)delete next[id];else next[id]=value;setRatings(next);return true}}>
      <ReplyTools id={key} author="鲸鱼娘" text={'第一行\n第二行'}/>
    </ReplyToolsProvider>
  }
  render(<Surface/>)
  fireEvent.click(screen.getByRole('button',{name:'复制回复'}))
  await screen.findByRole('button',{name:'已复制'})
  expect(writeText).toHaveBeenCalledWith('第一行\n第二行')
  const up=screen.getByRole('button',{name:'有帮助'}),down=screen.getByRole('button',{name:'没帮助'})
  fireEvent.click(up);await waitFor(()=>expect(up.getAttribute('aria-pressed')).toBe('true'))
  fireEvent.click(down);await waitFor(()=>expect(down.getAttribute('aria-pressed')).toBe('true'))
  expect(up.getAttribute('aria-pressed')).toBe('false')
  const more=screen.getByRole('button',{name:'更多回复操作'});fireEvent.click(more)
  const item=screen.getByRole('button',{name:'导出原文'});item.focus();fireEvent.keyDown(item,{key:'Escape'})
  expect(screen.queryByRole('button',{name:'导出原文'})).toBeNull()
  expect(document.activeElement).toBe(more)
  expect(decodeMessageSettings({preferences:{...DEFAULT_MESSAGE_PREFERENCES,reactions:{[key]:'up'}}})).toBeDefined()
  expect(decodeMessageSettings({preferences:DEFAULT_MESSAGE_PREFERENCES})).toBeDefined()
  expect(decodeMessageSettings({preferences:{...DEFAULT_MESSAGE_PREFERENCES,reactions:{arbitrary:'up'}}})).toBeUndefined()
})
it('indexes individual turns including those between visible ticks and focuses the selected turn',async()=>{
  const scrollTo=vi.fn()
  function Log(){
    const ref=useRef<HTMLDivElement>(null)
    return <TranscriptFrame scope="one" scroll={ref}><div ref={el=>{ref.current=el;if(el)el.scrollTo=scrollTo}}>{Array.from({length:18},(_,i)=><p key={i} data-turn-key={'turn-'+i} data-turn-title={'问题 '+i}>答复 {i}</p>)}</div></TranscriptFrame>
  }
  render(<Log/>)
  await screen.findByRole('navigation',{name:'对话时间线'})
  expect(screen.getAllByRole('button',{name:/跳到第/})).toHaveLength(9)
  fireEvent.click(screen.getByRole('button',{name:'对话目录'}))
  fireEvent.click(screen.getByRole('button',{name:'第 8 轮：问题 7'}))
  expect(scrollTo).toHaveBeenCalled()
  expect(document.activeElement?.getAttribute('data-turn-key')).toBe('turn-7')
})

