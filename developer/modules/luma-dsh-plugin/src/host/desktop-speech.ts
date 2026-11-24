import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run=promisify(execFile)
const ps=join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe')
const args=['-NoLogo','-NoProfile','-NonInteractive','-Command']
const init="Add-Type -AssemblyName System.Speech -ErrorAction Stop; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer -ErrorAction Stop;"
export function createDesktopSpeech(){
  let probe:Promise<boolean>|undefined,child:ChildProcess|undefined,playing='',failed='',disposed=false
  const available=()=>probe??=(process.platform==='win32'
    ? run(ps,[...args,init+" try { if (@($s.GetInstalledVoices() | Where-Object Enabled).Count -lt 1) { exit 1 } } finally {$s.Dispose()}"],{windowsHide:true,timeout:7000}).then(()=>true,()=>false)
    : Promise.resolve(false))
  function stop(id?:string){
    if(id && id!==playing)return
    const previous=child
    child=undefined;playing='';failed=''
    previous?.kill()
  }
  return {
    async status(){return {available:await available(),playing,failed}},
    async start(id:string,text:string){
      if(!await available()||disposed)throw Error('当前设备没有可用的本地朗读声音。')
      stop()
      const script="[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; "+init+
        " try {$s.Speak([Console]::In.ReadToEnd())} finally {$s.Dispose()}"
      const process=spawn(ps,[...args,script],{windowsHide:true,stdio:['pipe','ignore','ignore']})
      child=process;playing=id
      const ended=(bad:boolean)=>{if(child===process){child=undefined;playing='';failed=bad?id:''}}
      process.once('error',()=>ended(true));process.once('close',code=>ended(code!==0))
      process.stdin.on('error',()=>ended(true));process.stdin.end(text,'utf8')
      return {playing:id}
    },
    stop,dispose(){disposed=true;stop()},
  }
}
