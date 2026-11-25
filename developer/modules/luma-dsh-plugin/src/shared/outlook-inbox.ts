export interface OutlookHeader {
  subject: string
  sender: string
  received: string
  unread: boolean
}

export type OutlookPreview = { headers: OutlookHeader[] }

export function outlookDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {hour12:false})
}

export function outlookDraft(headers: OutlookHeader[]) {
  return ['我选取的 Outlook 邮件摘要', ...headers.map(row =>
    (row.unread ? '未读' : '已读') + ' · ' + outlookDate(row.received) + ' · ' + (row.sender || '未知发件人') + ' · ' + (row.subject || '（无主题）'),
  )].join('\n')
}
