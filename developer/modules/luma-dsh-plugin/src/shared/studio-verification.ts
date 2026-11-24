import type { DesktopReceipt } from '../host/studio-desktop.ts'

export type StudioReceipt = DesktopReceipt & {id:string;roleId:string}
export type ReceiptVerdict = 'pass'|'fail'|'unconfirmed'
export type StudioReview = {roleId:string;receiptId:string;verdict:ReceiptVerdict;note:string}

export function studioReviewers(ids:readonly string[], targets:Record<string,string>, duties:Record<string,string>={}) {
  const available=Object.keys(targets).length ? ids.slice(1).filter(id=>!targets[id]) : []
  const designated=available.filter(id=>/复核|校对|核验|质检|质量检查|审校|审核|review(?:er)?\b|verification|\bqa\b/i.test(duties[id]??''))
  const suggested=available.length===1 ? available[0] : designated.length===1 ? designated[0] : undefined
  return {available,suggested}
}
