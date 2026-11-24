import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { AgentJob } from '../src/client/agent-desk-api.ts'
import { StudioReceiptTrail } from '../src/client/StudioReceiptTrail.tsx'

afterEach(cleanup)
const names={lead:'协调人',operator:'窗口伙伴',qa:'复核人'}
function fixture():AgentJob {
  return {id:'job',roleIds:['lead','operator','qa'],mode:'team',workflow:'studio',reviewerId:'qa',text:'核对回执',
    status:'done',createdAt:1,desktopTargets:{operator:'target-1'},steps:[
      {phase:'work',roleId:'operator',status:'done',output:'',desktopReceipt:{id:'receipt-1',targetId:'target-1',
        roleId:'operator',title:'测试窗口',status:'observed',actions:[{action:'click',control:'提交',at:2}],clickCount:1,
        readbacks:[{control:'结果',text:'签收信封'}]}},
      {phase:'verify',roleId:'qa',status:'done',output:'',desktopReview:[{roleId:'operator',receiptId:'receipt-1',verdict:'pass',note:'读值吻合'}]},
      {phase:'review',roleId:'lead',status:'done',output:'',reviewedReceiptIds:['receipt-1']}
    ]}
}
it('shows the actual window readback, matched reviewer verdict and completed coordinator delivery',()=>{
  render(<StudioReceiptTrail job={fixture()} names={names}/>)
  expect(screen.getByLabelText('窗口回执，已收到 1 / 1 份')).toBeTruthy()
  for (const message of ['签收信封','点击 · 提交','复核通过','读值吻合','复核已交给协调人']) {
    expect(screen.getByText(message)).toBeTruthy()
  }
})
it('keeps another receipt’s verdict and delivery out of the current receipt',()=>{
  const job=fixture()
  job.steps[1]!.desktopReview![0]!.receiptId='elsewhere'
  job.steps[2]!.reviewedReceiptIds=['elsewhere']
  render(<StudioReceiptTrail job={job} names={names}/>)
  expect(screen.getByText('已回读')).toBeTruthy()
  expect(screen.queryByText('复核通过')).toBeNull()
  expect(screen.queryByText('复核已交给协调人')).toBeNull()
})
it('keeps partial and historical jobs legible without inventing evidence',()=>{
  const job=fixture()
  delete job.steps[0]!.desktopReceipt
  const view=render(<StudioReceiptTrail job={job} names={names}/>)
  expect(screen.getByLabelText('窗口回执，已收到 0 / 1 份')).toBeTruthy()
  expect(screen.getByText('等候回执')).toBeTruthy()
  delete job.reviewerId
  view.rerender(<StudioReceiptTrail job={job} names={names}/>)
  expect(view.container.childElementCount).toBe(0)
})
