import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentMemoryPanel } from '../src/client/AgentDeskPanels.tsx'
import type { AgentState } from '../src/client/agent-desk-api.ts'

function panel(house: AgentState['loveHouse']) {
  return renderToStaticMarkup(<AgentMemoryPanel roleId="jingyuniang" name="鲸鱼娘" canWrite house={house}
    count={0} refresh={async()=>{}} close={()=>{}} />)
}
describe('爱之屋记忆库选择', () => {
  it('仅在发现完整便携版绑定时显示复用和新建两项', () => {
    const base = {available:true,connected:false}
    expect(panel(base)).not.toContain('复用便携版的八个记忆库')
    const html = panel({...base,portableAvailable:true})
    expect(html).toContain('复用便携版的八个记忆库')
    expect(html).toContain('新建独立的八个记忆库')
  })
  it('复用后说明旧记录的位置和离线同步方式', () => {
    const html = panel({available:true,connected:true,reusedPortable:true})
    expect(html).toContain('旧记忆可在爱之屋查看')
    expect(html).toContain('离线时新增的记录')
    expect(html).toContain('本机记忆记录')
    expect(html).not.toContain('新建独立的八个记忆库')
  })
})
