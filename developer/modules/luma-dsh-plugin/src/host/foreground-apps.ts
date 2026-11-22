import { spawn, type ChildProcess } from 'node:child_process'
import type { AppUse } from '../shared/companion-life.ts'

// The helper emits only a process name, or an empty line when the user is idle.
const sampleWindows = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LumaForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [StructLayout(LayoutKind.Sequential)] public struct LastInput { public uint size; public uint tick; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LastInput last);
  public static bool IsActive() {
    var last = new LastInput { size = (uint)Marshal.SizeOf(typeof(LastInput)) };
    return GetLastInputInfo(ref last) && unchecked((uint)Environment.TickCount - last.tick) < 180000u;
  }
}
'@
while ($true) {
  $name = ''
  if ([LumaForeground]::IsActive()) {
    [uint32]$activeId = 0
    $win = [LumaForeground]::GetForegroundWindow()
    [void][LumaForeground]::GetWindowThreadProcessId($win, [ref]$activeId)
    if ($activeId) {
      $process = Get-Process -Id $activeId -ErrorAction SilentlyContinue
      if ($process -and $process.ProcessName -notin 'LockApp','LogonUI','Consent','CredentialUIBroker') { $name = $process.ProcessName }
    }
  }
  [Console]::Out.WriteLine($name)
  Start-Sleep -Seconds 15
}`
const horizon = 15 * 60_000
export function createAppUsage(clock = Date.now) {
  let child: ChildProcess | undefined, lease: ReturnType<typeof setTimeout> | undefined
  let last: { name: string; at: number } | undefined
  let samples: { name: string; start: number; end: number }[] = []
  let phase: 'off' | 'waiting' | 'ready' | 'unavailable' = 'off'
  let retryAt = 0
  function accept(raw: string, now: number) {
    const name = raw.trim()
    const valid = name.length <= 72 && /^[\p{L}\p{N}._ ()+-]+$/u.test(name)
    // Suspend and foreground switches do not count as dwell time.
    if (last && valid && last.name === name && now > last.at && now - last.at <= 25_000) {
      samples.push({ name, start:last.at, end:now })
    }
    last = valid ? {name, at:now} : undefined
    samples = samples.filter(item => item.end > now-horizon)
    phase = 'ready'
  }
  function stop() {
    clearTimeout(lease)
    const active = child
    child = undefined
    active?.kill()
    samples = []
    last = undefined
    retryAt = 0
    phase = 'off'
  }
  function pulse() {
    clearTimeout(lease)
    lease = setTimeout(stop,75_000)
    lease.unref()
    if (child || clock() < retryAt) return
    if (process.platform !== 'win32') { phase='unavailable'; return }
    phase = 'waiting'
    const proc = spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(sampleWindows,'utf16le').toString('base64')],
      {windowsHide:true, stdio:['ignore','pipe','ignore']})
    child = proc
    let partial=''
    proc.stdout.setEncoding('utf8').on('data',(chunk:string) => {
      if (child !== proc) return
      const lines=(partial+chunk).split('\n')
      partial=lines.pop()!.slice(-100)
      for(const line of lines) accept(line,clock())
    })
    function ended() {
      if(child !== proc) return
      child=undefined; last=undefined; phase='unavailable'; retryAt=clock()+120_000
    }
    proc.once('error',ended)
    proc.once('close',ended)
  }
  function summary(now=clock()):AppUse[] {
    const byName = new Map<string,number>()
    for(const item of samples) {
      const dwell=item.end-Math.max(item.start,now-horizon)
      if(dwell>0) byName.set(item.name,(byName.get(item.name) ?? 0)+dwell)
    }
    return [...byName.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([app,ms])=>({app, seconds:Math.floor(ms/1000)}))
  }
  return {pulse,stop,summary,accept,status:()=>phase}
}
