import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getLocalDecimalHour, getOfficeTimePhase, OFFICE_TIME_PHASES } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-time/domain/timePolicy.ts'

interface Strip { path:string;gaitPath:string;frameWidth:number;frameHeight:number;frameCount:number;frameDurationsMs?:number[] }
declare const __LUMA_PET_ART__: Record<string,{strips:Record<string,Strip>;sleep:string;sleepMirror:boolean;sleepAngle:number}>
const bedtime=()=>getOfficeTimePhase(getLocalDecimalHour())===OFFICE_TIME_PHASES.CLOSED
type PetMode = 'field'|'peeking'|'hidden-edge'
type PetState = {roleId:string;skinId:string|null;mode:PetMode;side:'left'|'right'|null}
interface Pet {process:ChildProcessWithoutNullStreams;state:PetState;closed:Promise<void>}

export function desktopPets(directory:string, unlocked:()=>readonly string[], skin:(role:string)=>string|undefined) {
  const pets = new Map<string,Pet>()
  const supported = process.platform === 'win32'
  let disposed=false
  let queue:Promise<unknown>=Promise.resolve()
  function config(role:string) {
    const selected=skin(role) ?? null
    const variant=selected || role==='gemini' || role==='grok' ? 'v1' : 'base'
    const key=role+'-'+variant
    const source=__LUMA_PET_ART__[key]
    if (!source) throw Error('缺少该伙伴的桌宠素材。')
    const assetPath=(p:string)=>join(directory,'../public',p)
    return {skinId:selected, strips:Object.fromEntries(Object.entries(source.strips).map(([dir,strip])=>
      [dir,{...strip,path:assetPath(strip.path),gaitPath:assetPath(strip.gaitPath)}])),
      sleep:assetPath(source.sleep),sleepAngle:source.sleepAngle,sleepMirror:source.sleepMirror,peek:join(directory,'pet-art',key+'.png')}
  }
  function command(pet:Pet, message:object) {
    if (pet.process.stdin.writable && !pet.process.stdin.destroyed) pet.process.stdin.write(JSON.stringify(message)+'\n')
  }
  async function closePet(pet:Pet) {
    command(pet,{action:'quit'})
    pet.process.stdin.end()
    const timer=setTimeout(()=>pet.process.kill(),2000)
    try { await pet.closed } finally { clearTimeout(timer) }
  }
  async function open(role:string, atCursor:boolean, reduceMotion:boolean) {
    const existing=pets.get(role)
    if(existing) {
      command(existing,{action:'show',atCursor,reduceMotion})
      return
    }
    if(disposed) throw Error('桌宠服务已关闭。')
    const art=config(role)
    const child=spawn(join(directory,'DesktopPet.exe'),[],{stdio:'pipe',windowsHide:true})
    const closed=new Promise<void>(resolve=>{child.once('close',()=>resolve())})
    const pet:Pet={process:child,state:{roleId:role,skinId:art.skinId,mode:'field',side:null},closed}
    child.stdin.on('error',()=>{})
    child.stderr.resume()
    pets.set(role,pet)
    void closed.then(()=>{if(pets.get(role)===pet)pets.delete(role)})
    const lines=createInterface({input:child.stdout})
    try {
      await new Promise<void>((ok,no)=>{
        const timer=setTimeout(()=>no(Error('桌宠窗口启动超时。')),25000)
        const fail=()=>{clearTimeout(timer);no(Error('桌宠窗口已关闭，或桌宠素材加载失败。'))}
        child.once('error',fail)
        child.once('close',fail)
        lines.on('line',line=>{
          try {
            const event=JSON.parse(line.replace(/^\uFEFF/, ''))
            if(!['field','peeking','hidden-edge'].includes(event.mode))return
            pet.state={...pet.state,mode:event.mode,side:['left','right'].includes(event.side)?event.side:null}
            clearTimeout(timer);ok()
          } catch {}
        })
        command(pet,{action:'open',roleId:role,...art,atCursor,reduceMotion,asleep:bedtime()})
      })
    } catch(error) { await closePet(pet);throw error }
  }
  async function request(body:Record<string,unknown>) {
    if(disposed) throw Error('桌宠服务已关闭。')
    const roles=unlocked()
    for(const [role,pet] of pets) {
      if(!roles.includes(role)) {await closePet(pet);continue}
      if((skin(role)??null)!==pet.state.skinId) {
        const art=config(role)
        command(pet,{action:'outfit',...art})
        pet.state={...pet.state,skinId:art.skinId}
      }
    }
    if(body.action!=='status') {
      if(!supported)throw Error('桌宠需要 Windows 桌面版 DSH。')
      if(typeof body.roleId!=='string' || !roles.includes(body.roleId))throw Error('请先邀请这位伙伴。')
      if(body.action==='open') await open(body.roleId,body.atCursor===true,body.reduceMotion===true)
      else if(body.action==='recall') {const pet=pets.get(body.roleId);if(pet)await closePet(pet)}
      else throw Error('未知的桌宠操作。')
    }
    return {supported,pets:Array.from(pets.values(),pet=>({...pet.state}))}
  }
  let wasBedtime=bedtime()
  const clock=setInterval(()=>{
    const asleep=bedtime()
    if(asleep!==wasBedtime)for(const pet of pets.values())command(pet,{action:'clock',asleep})
    wasBedtime=asleep
  },1000)
  clock.unref()
  return {
    async handler(req:IncomingMessage,res:ServerResponse) {
      const reply=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
      if(req.method!=='POST') return reply(405,{ok:false,error:'请使用 POST 请求。'})
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')) return reply(415,{ok:false,error:'请选择 JSON 格式。'})
      try {
        let data=''
        for await(const part of req){data+=part;if(data.length>4096) throw Error('桌宠操作参数过长。')}
        const body=JSON.parse(data)
        if(!body || typeof body!=='object' || !['status','open','recall'].includes(body.action)) throw Error('未知的桌宠操作。')
        const task=queue.then(()=>request(body))
        queue=task.catch(()=>{})
        reply(200,{ok:true,value:await task})
      }catch(e){reply(400,{ok:false,error:e instanceof Error?e.message:'无法操作桌宠。'})}
    },
    async dispose() {
      disposed=true
      clearInterval(clock)
      await queue
      await Promise.all([...pets.values()].map(closePet))
    }
  }
}
