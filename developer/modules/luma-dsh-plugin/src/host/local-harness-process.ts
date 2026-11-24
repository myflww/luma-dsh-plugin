import { spawn } from 'node:child_process'
import { access, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

export type HarnessId = 'codex' | 'claude'
export type HarnessProgram = {file:string; args?:string[]}

export async function findHarness(id:HarnessId):Promise<HarnessProgram|undefined> {
  const windows = process.platform === 'win32'
  const exe = windows ? id+'.exe' : id
  const candidates:string[] = []
  // Explorer may start the desktop app without the CLI's new PATH entry.
  if (id === 'codex' && windows && process.env.LOCALAPPDATA) {
    const bin = join(process.env.LOCALAPPDATA,'OpenAI','Codex','bin')
    const versions = await readdir(bin,{withFileTypes:true}).catch(()=>[])
    const binaries = await Promise.all(versions.filter(v=>v.isDirectory()).map(async v=>{
      const file=join(bin,v.name,exe), info=await stat(file).catch(()=>undefined)
      return {file,time:info?.mtimeMs ?? 0}
    }))
    candidates.push(...binaries.sort((a,b)=>b.time-a.time).filter(v=>v.time).map(v=>v.file))
  }
  if (id === 'claude') candidates.push(join(homedir(),'.local','bin',exe))
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(isAbsolute)
  for (const dir of dirs) {
    candidates.push(join(dir,exe))
    if (id==='codex' && windows) {
      const arch=process.arch==='arm64'?'aarch64':'x86_64'
      candidates.push(join(dir,'node_modules','@openai','codex','node_modules','@openai','codex-win32-'+process.arch,'vendor',arch+'-pc-windows-msvc','bin',exe))
    }
  }
  for (const file of candidates) {
    try { await access(file,constants.X_OK); if ((await stat(file)).isFile()) return {file} } catch {}
  }
}

export function subscriptionEnvironment(env:NodeJS.ProcessEnv=process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/^(?:OPENAI_|ANTHROPIC_|CLAUDECODE$|CLAUDE_CODE_|CODEX_(?!HOME$)|NODE_OPTIONS$)/i.test(key)))
}

export async function isolatedTurn<T>(run:(cwd:string)=>Promise<T>):Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(),'luma-harness-'))
  try { return await run(cwd) } finally { await rm(cwd,{recursive:true,force:true,maxRetries:3,retryDelay:100}) }
}

// Some operations (filesystem discovery and a pending protocol read) do not
// themselves accept a signal. Keep their late result out of the caller's turn.
export function withHarnessDeadline<T>(signal:AbortSignal,run:()=>Promise<T>):Promise<T> {
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted()
    const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason)}
    signal.addEventListener('abort',abort,{once:true})
    Promise.resolve().then(()=>{signal.throwIfAborted();return run()}).then(
      value=>{signal.removeEventListener('abort',abort);resolve(value)},
      error=>{signal.removeEventListener('abort',abort);reject(error)},
    )
  })
}

type ProcessOptions={cwd:string;signal:AbortSignal;onSpawn?:(pid:number)=>void}
export async function harnessProcess<T>(program:HarnessProgram,args:string[],options:ProcessOptions,
  run:(send:(text:string,end?:boolean)=>void, lines:AsyncGenerator<string>)=>Promise<T>):Promise<T> {
  options.signal.throwIfAborted()
  const child = spawn(program.file,[...(program.args ?? []),...args],{
    cwd:options.cwd,env:subscriptionEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false,
  })
  let failed=false
  const exited=new Promise<void>(resolve=>{
    child.once('exit',()=>resolve())
    child.once('error',()=>{failed=true;resolve()})
  })
  child.stdin.on('error',()=>{failed=true})
  child.stderr.resume()
  const stop=()=>{
    child.stdin.destroy()
    child.stdout.destroy()
    child.stderr.destroy()
    if (child.exitCode===null && child.signalCode===null && !child.killed) child.kill('SIGKILL')
  }
  options.signal.addEventListener('abort',stop,{once:true})
  child.stdout.setEncoding('utf8')
  async function* lines() {
    let buffer=''
    for await (const part of child.stdout) {
      buffer+=String(part)
      let offset:number
      while ((offset=buffer.indexOf('\n'))>=0) {
        if (offset>2_000_000) throw Error('模型服务返回的 CLI 数据超过限制。')
        const line=buffer.slice(0,offset).trim(); buffer=buffer.slice(offset+1)
        if (line) yield line
      }
      if (buffer.length>2_000_000) throw Error('模型服务返回的 CLI 数据超过限制。')
    }
    if (buffer.trim()) yield buffer.trim()
    options.signal.throwIfAborted()
    if (failed) throw Error('模型服务未能启动本机 CLI，请检查安装与登录。')
  }
  const send=(text:string,end=false)=>{options.signal.throwIfAborted(); if(end) child.stdin.end(text); else child.stdin.write(text)}
  try {
    if(child.pid)options.onSpawn?.(child.pid)
    return await withHarnessDeadline(options.signal,()=>run(send,lines()))
  }
  finally {
    options.signal.removeEventListener('abort',stop)
    stop()
    // Only this direct child belongs to the adapter. Other processes can
    // inherit pipe handles; their lifetime must never hold a completed turn.
    let timer:ReturnType<typeof setTimeout>|undefined
    try {await Promise.race([exited,new Promise<void>(ok=>{timer=setTimeout(ok,400);timer.unref()})])}
    finally {clearTimeout(timer)}
  }
}
