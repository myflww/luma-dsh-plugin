import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createOfficeClockPolicy } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-time/domain/timePolicy.ts'

interface Strip { path:string;gaitPath:string;frameWidth:number;frameHeight:number;frameCount:number;frameDurationsMs?:number[] }
declare const __LUMA_PET_ART__: Record<string,{strips:Record<string,Strip>;sleep:string;sleepMirror:boolean;sleepAngle:number}>
export type DesktopPetCalendar=Pick<NonNullable<Parameters<typeof createOfficeClockPolicy>[0]>,'calendar'|'officialCalendarCache'>
export function desktopPetPeriod(date=new Date(), calendar:DesktopPetCalendar={}) {
  const policy=createOfficeClockPolicy({date,...calendar})
  return policy.bedtime?'night':policy.attendancePeriod==='lunch'?'lunch':'day'
}
export const desktopPetBedtime=(date=new Date())=>desktopPetPeriod(date)==='night'
type PetMode = 'field'|'peeking'|'hidden-edge'
type PetActivity = 'awake'|'greeting'|'lunch'|'sleepy'|'settling'|'dozing'
type PetState = {roleId:string;skinId:string|null;mode:PetMode;side:'left'|'right'|null;activity:PetActivity}
interface Pet {process:ChildProcessWithoutNullStreams;state:PetState;closed:Promise<void>;slot:number;windowId?:number;reduceMotion:boolean;requestedSkin:string|null;retrySkinAt:number}

export function desktopPets(directory:string, unlocked:()=>readonly string[], skin:(role:string)=>string|undefined, readCalendar:()=>DesktopPetCalendar=()=>({})) {
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
      sleep:assetPath(source.sleep),sleepAngle:source.sleepAngle,sleepMirror:source.sleepMirror,
      peek:join(directory,'pet-art',key+'.png'),ledge:join(directory,'pet-art','ledge',key+'.png'),
      sleepyPose:join(directory,'pet-art','drowsy',key+'.png'),greet:join(directory,'pet-art','greet',key+'.png'),
      lunchPose:join(directory,'pet-art','lunch',key+'.png')}
  }
  function command(pet:Pet, message:object) {
    if (pet.process.stdin.writable && !pet.process.stdin.destroyed) pet.process.stdin.write(JSON.stringify(message)+'\n')
  }
  function neighbors(self:Pet) {
    return [...pets.values()].flatMap(pet=>pet!==self && pet.windowId?[pet.windowId]:[])
  }
  function shareWindows() {
    for(const pet of pets.values())if(pet.windowId)command(pet,{action:'peers',peers:neighbors(pet)})
  }
  async function closePet(pet:Pet) {
    command(pet,{action:'quit'})
    pet.process.stdin.end()
    const timer=setTimeout(()=>pet.process.kill(),2000)
    try { await pet.closed } finally { clearTimeout(timer) }
  }
  async function open(role:string, atCursor:boolean, reduceMotion:boolean) {
    const existing=pets.get(role)
    if(existing&&(existing.process.exitCode!==null||existing.process.stdin.writableEnded))await existing.closed
    else if(existing) {
      existing.reduceMotion=reduceMotion
      command(existing,{action:'show',atCursor,reduceMotion})
      return
    }
    if(disposed) throw Error('桌宠服务已关闭。')
    const art=config(role)
    const child=spawn(join(directory,'DesktopPet.exe'),[],{stdio:'pipe',windowsHide:true})
    const closed=new Promise<void>(resolve=>{child.once('close',()=>resolve())})
    const occupied=new Set([...pets.values()].map(pet=>pet.slot))
    let slot=0
    while(occupied.has(slot))slot++
    const pet:Pet={process:child,state:{roleId:role,skinId:art.skinId,mode:'field',side:null,activity:'awake'},closed,slot,reduceMotion,
      requestedSkin:art.skinId,retrySkinAt:0}
    child.stdin.on('error',()=>{})
    child.stderr.resume()
    pets.set(role,pet)
    void closed.then(()=>{if(pets.get(role)===pet){pets.delete(role);shareWindows()}})
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
            pet.state={...pet.state,mode:event.mode,side:['left','right'].includes(event.side)?event.side:null,
              skinId:event.skinId===null||event.skinId===pet.requestedSkin?event.skinId:pet.state.skinId,
              activity:['greeting','lunch','sleepy','settling','dozing'].includes(event.activity)?event.activity:'awake'}
            if(Number.isSafeInteger(event.windowId)&&event.windowId>0&&event.windowId!==pet.windowId) {
              pet.windowId=event.windowId;shareWindows()
            }
            clearTimeout(timer);ok()
          } catch {}
        })
        const period=desktopPetPeriod(new Date(),readCalendar())
        command(pet,{action:'open',roleId:role,...art,atCursor,reduceMotion,asleep:period==='night',lunch:period==='lunch',nightSlot:slot,peers:neighbors(pet)})
      })
    } catch(error) { await closePet(pet);throw error }
  }
  async function request(body:Record<string,unknown>) {
    if(disposed) throw Error('桌宠服务已关闭。')
    if(pets.size)syncPeriod()
    const roles=unlocked()
    for(const [role,pet] of pets) {
      if(!roles.includes(role)) {await closePet(pet);continue}
      if(body.action==='status'&&typeof body.reduceMotion==='boolean'&&pet.reduceMotion!==body.reduceMotion){
        pet.reduceMotion=body.reduceMotion;command(pet,{action:'motion',reduceMotion:pet.reduceMotion})
      }
      const desired=skin(role)??null
      if(desired!==pet.requestedSkin || desired!==pet.state.skinId&&Date.now()>=pet.retrySkinAt) {
        const art=config(role)
        command(pet,{action:'outfit',...art})
        pet.requestedSkin=art.skinId;pet.retrySkinAt=Date.now()+30000
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
  let lastPeriod=desktopPetPeriod(new Date(),readCalendar())
  function syncPeriod(){
    const period=desktopPetPeriod(new Date(),readCalendar())
    if(period!==lastPeriod)for(const pet of pets.values())command(pet,{action:'clock',asleep:period==='night',lunch:period==='lunch'})
    lastPeriod=period
  }
  let minute=Math.floor(Date.now()/60000)
  const clock=setInterval(()=>{
    const now=Math.floor(Date.now()/60000)
    if(now===minute)return
    minute=now
    if(pets.size)syncPeriod()
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
