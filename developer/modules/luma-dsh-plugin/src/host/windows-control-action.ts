import { execFile } from 'node:child_process'
import { join } from 'node:path'

type WindowIdentity={id:string;pid:number;process_instance:string}
export type NativeControl={role:string;name:string;automationId?:string}
export type CheckedField={control:NativeControl;digest:string}

// UIA identifies the accessible element. Win32 messages target only a named,
// standard child control of the selected process instance. No input is sent
// through desktop focus, key simulation, mouse coordinates or the clipboard.
const script=String.raw`
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$q=[Console]::In.ReadToEnd() | ConvertFrom-Json
try {
Add-Type -AssemblyName Accessibility
Add-Type -ReferencedAssemblies ([Accessibility.IAccessible].Assembly.Location) -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using Accessibility;
public static class WindowControl {
 delegate bool EnumChild(IntPtr hwnd,IntPtr value);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr root,EnumChild enumerate,IntPtr value);
 [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr hwnd,uint id,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out object obj);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,int kind);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint id);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] public static extern int Style(IntPtr h,int index);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder name,int size);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",CharSet=CharSet.Unicode)] public static extern IntPtr Write(IntPtr h,uint msg,IntPtr w,string text,uint flags,uint ms,out IntPtr result);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",CharSet=CharSet.Unicode)] public static extern IntPtr Read(IntPtr h,uint msg,IntPtr w,StringBuilder text,uint flags,uint ms,out IntPtr result);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW")] public static extern IntPtr Message(IntPtr h,uint msg,IntPtr w,IntPtr l,uint flags,uint ms,out IntPtr result);
 public static IntPtr Resolve(IntPtr root,uint pid,string name,bool button) {
   var matches = new List<IntPtr>();
   EnumChildWindows(root,delegate(IntPtr h,IntPtr unused) {
     uint owner; GetWindowThreadProcessId(h,out owner);
     if (owner!=pid || GetAncestor(h,2)!=root || !IsWindowVisible(h) || !IsWindowEnabled(h)) return true;
     var buf=new StringBuilder(160);GetClassName(h,buf,buf.Capacity);
     var cls=buf.ToString();
     var nativeClass=button?"BUTTON":"EDIT";
     if(!cls.Equals(nativeClass,StringComparison.OrdinalIgnoreCase) &&
        !(cls.StartsWith("WindowsForms",StringComparison.Ordinal) && cls.IndexOf("."+nativeClass+".",StringComparison.OrdinalIgnoreCase)>=0))return true;
     var style=Style(h,-16);
     if(button ? ((style & 15)!=0 && (style & 15)!=1 && (style & 15)!=11) : (style & 0x820)!=0)return true;
     object obj=null;
     try {
       Guid iid=typeof(IAccessible).GUID;
       if(AccessibleObjectFromWindow(h,unchecked((uint)-4),ref iid,out obj)!=0 || obj==null)return true;
       var acc=(IAccessible)obj;
       if(!String.Equals(acc.get_accName(0),name,StringComparison.Ordinal) || Convert.ToInt32(acc.get_accRole(0))!=(button?43:42))return true;
       int state=Convert.ToInt32(acc.get_accState(0));
       if((state & 0x20000001)==0 && (button || (state & 64)==0))matches.Add(h);
     } catch(COMException){} finally {if(obj!=null && Marshal.IsComObject(obj))Marshal.ReleaseComObject(obj);}
     return matches.Count<2;
   },IntPtr.Zero);
   return matches.Count==1?matches[0]:IntPtr.Zero;
 }
}
'@
$root=[IntPtr]([int64]$q.window.id.Substring(2))
$process=[Diagnostics.Process]::GetProcessById([int]$q.window.pid)
$stamp=$q.window.process_instance.Split(':')
if($stamp.Length -ne 3 -or $stamp[0] -cne 'windows-proc-v1' -or $process.StartTime.ToUniversalTime().ToFileTimeUtc() -ne ([long]$stamp[1]*[long]10000000+[long]$stamp[2])){throw 'stale'}
function MatchesOwner([IntPtr]$h){
    [uint32]$owner=0
    $null=[WindowControl]::GetWindowThreadProcessId($h,[ref]$owner)
    return $owner -eq $q.window.pid -and [WindowControl]::GetAncestor($h,2) -eq $root
}
if(!(MatchesOwner $root) -or ![WindowControl]::IsWindowVisible($root) -or [WindowControl]::IsIconic($root)){throw 'stale'}
function ResolveControl($selector,[bool]$button){
    if(!$selector.name -or $selector.name.Length -gt 180){throw 'unsupported'}
    $h=[WindowControl]::Resolve($root,$q.window.pid,$selector.name,$button)
    if($h -eq [IntPtr]::Zero -or !(MatchesOwner $h)){throw 'unsupported'}
    return $h
}
function FieldDigest([IntPtr]$h){
    $length=[IntPtr]::Zero
    if([WindowControl]::Message($h,14,[IntPtr]::Zero,[IntPtr]::Zero,2,1200,[ref]$length) -eq [IntPtr]::Zero -or $length.ToInt64() -gt 16000){throw 'changed'}
    $text=[Text.StringBuilder]::new([int]$length.ToInt64()+1);$actual=[IntPtr]::Zero
    if([WindowControl]::Read($h,13,[IntPtr]$text.Capacity,$text,2,1200,[ref]$actual) -eq [IntPtr]::Zero -or $actual.ToInt64() -ne $length.ToInt64()){throw 'changed'}
    $hash=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($text.ToString()))).Replace('-','').ToLowerInvariant()}
    finally{$hash.Dispose()}
}
$click=$q.action -ceq 'click'
$control=ResolveControl $q.control $click
$result=[IntPtr]::Zero
if($click){
    $parent=[WindowControl]::GetParent($control)
    if(!(MatchesOwner $parent)){throw 'stale'}
    foreach($field in $q.expected){$edit=ResolveControl $field.control $false;if((FieldDigest $edit) -cne $field.digest){throw 'changed'}}
    if(!(MatchesOwner $control) -or [WindowControl]::GetParent($control) -ne $parent){throw 'stale'}
    $id=[WindowControl]::GetDlgCtrlID($control) -band 65535
    if([WindowControl]::Message($parent,273,[IntPtr]$id,$control,2,1800,[ref]$result) -eq [IntPtr]::Zero){throw 'uncertain'}
}else{
    if(!(MatchesOwner $control)){throw 'stale'}
    if([WindowControl]::Write($control,12,[IntPtr]::Zero,[string]$q.text,2,1800,[ref]$result) -eq [IntPtr]::Zero -or $result -eq [IntPtr]::Zero){throw 'uncertain'}
}
[Console]::Write('done')
} catch {
 $m=$_.Exception.Message
 if($m -notin @('unsupported','stale','changed','uncertain')){$m='unsupported'}
 [Console]::Write($m)
}
`

export async function writeWindowControl(window:WindowIdentity,control:NativeControl,action:'set-value'|'click',text:string|undefined,expected:CheckedField[],signal:AbortSignal) {
  const shell=join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe')
  return new Promise<'done'|'unsupported'|'stale'|'changed'|'uncertain'>((resolve,reject)=>{
    const child=execFile(shell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
      {windowsHide:true,signal,timeout:15000,maxBuffer:4096},(error,stdout)=>{
        if(signal.aborted)return reject(signal.reason)
        if(error)return resolve('uncertain')
        const value=stdout.trim()
        resolve(value==='done'||value==='unsupported'||value==='stale'||value==='changed'?value:'uncertain')
      })
    child.stdin?.on('error',()=>{})
    child.stdin?.end(JSON.stringify({window:{id:window.id,pid:window.pid,process_instance:window.process_instance},control,action,text,expected}))
  })
}
