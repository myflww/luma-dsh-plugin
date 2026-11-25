import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { OutlookHeader, OutlookPreview } from '../shared/outlook-inbox.ts'

const run = promisify(execFile)
const limit = 20
// Read only table columns from an existing Outlook session. GetActiveObject never starts Outlook.
const readHeaders = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if (-not [type]::GetTypeFromProgID('Outlook.Application')) { Write-Output 'MISSING'; exit }
try { $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') }
catch { Write-Output 'CLOSED'; exit }
$inbox = $outlook.Session.GetDefaultFolder(6)
$filter = '@SQL="http://schemas.microsoft.com/mapi/proptag/0x001A001F" LIKE ''IPM.Note%'''
$table = $inbox.GetTable($filter)
$columns = $table.Columns
$columns.RemoveAll()
$flags = 'http://schemas.microsoft.com/mapi/proptag/0x0E070003'
foreach ($field in @('Subject', 'SenderName', 'ReceivedTime', $flags)) { [void]$columns.Add($field) }
$table.Sort('[ReceivedTime]', $true)
$headers = @()
while (-not $table.EndOfTable -and $headers.Count -lt ${limit}) {
  $row = $table.GetNextRow()
  $subject = [string]$row.Item('Subject')
  $sender = [string]$row.Item('SenderName')
  $headers += @{
    subject = $subject.Substring(0, [Math]::Min($subject.Length, 300))
    sender = $sender.Substring(0, [Math]::Min($sender.Length, 160))
    received = ([datetime]$row.Item('ReceivedTime')).ToUniversalTime().ToString('o')
    unread = (([int]$row.Item($flags) -band 1) -eq 0)
  }
}
ConvertTo-Json -Compress -Depth 3 -InputObject @{ headers = $headers }
`

export async function readOutlookInbox(): Promise<OutlookPreview> {
  if (process.platform !== 'win32') throw Error('邮件预览需要 Windows 经典 Outlook。')
  const powershell = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  let output: string
  try {
    const result = await run(powershell, ['-NoProfile','-NonInteractive','-STA','-EncodedCommand',
      Buffer.from(readHeaders, 'utf16le').toString('base64')],
    {windowsHide:true, timeout:12000, maxBuffer:256 * 1024, encoding:'utf8'})
    output = result.stdout.trim()
  } catch {
    throw Error('未能读取收件箱。请确认经典 Outlook 已打开、已登录，并检查是否有待处理的提示。')
  }
  if (output === 'MISSING') throw Error('未检测到经典 Outlook。此功能需要 Windows 经典 Outlook 和已登录的邮箱。')
  if (output === 'CLOSED') throw Error('请打开经典 Outlook，进入收件箱后重试。')
  return parseOutlookPreview(output)
}

export function parseOutlookPreview(output: string): OutlookPreview {
  const invalid = () => Error('经典 Outlook 返回了无法读取的邮件摘要。')
  let parsed: { headers?: unknown } | null
  try { parsed = JSON.parse(output) } catch { throw invalid() }
  if (!Array.isArray(parsed?.headers)) throw invalid()
  const clean = (text: string, size: number) => text.replace(/[\u0000-\u001f\u007f]+/g,' ').trim().slice(0,size)
  const headers = parsed.headers.slice(0, limit).map((row): OutlookHeader => {
    if (!row || typeof row.subject !== 'string' || typeof row.sender !== 'string' ||
        typeof row.unread !== 'boolean' || typeof row.received !== 'string' || !Number.isFinite(Date.parse(row.received))) throw invalid()
    return {subject:clean(row.subject,300), sender:clean(row.sender,160), received:new Date(row.received).toISOString(), unread:row.unread}
  })
  return {headers}
}
