import {createHash} from 'node:crypto'
import {mkdir,readFile,stat,symlink,unlink,writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {isAbsolute,join} from 'node:path'
import {harnessProcess,subscriptionEnvironment,type HarnessProgram} from './local-harness-process.ts'
import {textFileBlock} from '../shared/chat-attachments.ts'
import type {TextMessage} from './employee-model.ts'

const managed='managed:kimi-code'
const loginError=()=>Error('模型服务未检测到 Kimi Code 的订阅登录，请在本机运行 kimi login。')
const modelId=(v:unknown):v is string=>typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9.:_/-]{0,179}$/.test(v)

// Kimi itself owns credential access and refresh. Map only its credential
// directory so that sessions, tools, hooks and plugins use a fresh profile.
async function withKimiProfile<T>(cwd:string,run:(env:NodeJS.ProcessEnv)=>Promise<T>):Promise<T> {
  const userHome=process.env.KIMI_CODE_HOME || join(homedir(),'.kimi-code')
  if(!isAbsolute(userHome)) throw loginError()
  const credentials=join(userHome,'credentials')
  if(!(await stat(credentials).catch(()=>undefined))?.isDirectory()) throw loginError()
  const profile=join(cwd,'kimi-profile'), link=join(profile,'credentials')
  await mkdir(profile,{recursive:true,mode:0o700})
  const global=(await readFile(join(userHome,'region'),'utf8').catch(()=>'' )).trim()==='global'
  const domain=global?'kimi.ai':'kimi.com'
  const baseUrl='https://api.'+domain+'/coding/v1', oauthHost='https://auth.'+domain
  const key=global?'oauth/kimi-code-env-'+createHash('sha256').update(JSON.stringify({oauthHost,baseUrl})).digest('hex').slice(0,16):'oauth/kimi-code'
  const config=['auto_session_title = false','telemetry = false','[model_catalog]','refresh_on_start = false',
    '[tools]','enabled = ["*"]','[providers."managed:kimi-code"]','type = "kimi"','base_url = "'+baseUrl+'"',
    'oauth = { storage = "file", key = "'+key+'", oauth_host = "'+oauthHost+'" }'].join('\n')
  // A catalog refresh populates models in this temporary config for the turn.
  try {await writeFile(join(profile,'config.toml'),config,{flag:'wx',mode:0o600})}
  catch(error) {if((error as NodeJS.ErrnoException).code!=='EEXIST') throw error}
  const env=Object.fromEntries(Object.entries(subscriptionEnvironment()).filter(([key])=>
    !/^(?:KIMI_|MOONSHOT_|GEMINI_|GOOGLE_|AWS_|XDG_|HOME$|USERPROFILE$)/i.test(key)))
  Object.assign(env,{HOME:cwd,USERPROFILE:cwd,KIMI_CODE_HOME:profile,KIMI_DISABLE_TELEMETRY:'1'})
  if(process.env.KIMI_SHELL_PATH && isAbsolute(process.env.KIMI_SHELL_PATH)) env.KIMI_SHELL_PATH=process.env.KIMI_SHELL_PATH
  await symlink(credentials,link,process.platform==='win32'?'junction':'dir')
  try {return await run(env)} finally {await unlink(link)}
}

export async function kimiCatalog(cli:HarnessProgram,cwd:string,signal:AbortSignal,models:boolean,onSpawn?:(pid:number)=>void) {
  return withKimiProfile(cwd,env=>harnessProcess(cli,['web','--host','127.0.0.1','--json'],{cwd,env,signal,onSpawn},async(_send,lines)=>{
    const next=await lines.next()
    if(next.done) throw Error('模型服务需要新版 Kimi Code CLI。')
    const boot=JSON.parse(next.value)
    if(typeof boot.origin!=='string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(boot.origin) || typeof boot.token!=='string' || !boot.token) {
      throw Error('模型服务无法连接 Kimi 的本机接口。')
    }
    async function api(path:string,method='GET') {
      const response=await fetch(boot.origin+'/api/v1/'+path,{method,signal,redirect:'error',
        headers:{authorization:'Bearer '+boot.token,...(method==='POST'?{'content-type':'application/json'}:{})},
        ...(method==='POST'?{body:'{}'}:{})})
      if(!response.ok) throw Error('模型服务无法读取 Kimi 的登录状态或模型列表。')
      const body=await response.json()
      if(body?.code!==0) throw Error('模型服务无法读取 Kimi 的登录状态或模型列表。')
      return body.data
    }
    const account=(await api('auth'))?.managed_provider
    if(account?.name!==managed || account.status!=='authenticated') throw loginError()
    if(!models) return []
    await api('providers:refresh_oauth','POST')
    const list=(await api('models'))?.items
    if(!Array.isArray(list)) throw Error('模型服务无法读取 Kimi 的模型列表。')
    return list.filter(row=>row.provider===managed && modelId(row.model)).map(row=>({
      id:String(row.model),name:typeof row.display_name==='string'?row.display_name.slice(0,180):String(row.model),
      efforts:[] as {id:string;name:string}[],
    }))
  }))
}

export async function kimiRequest(cli:HarnessProgram,cwd:string,signal:AbortSignal,model:string,messages:TextMessage[],instruction:string,onSpawn?:(pid:number)=>void) {
  const prompt=[{type:'text',text:JSON.stringify(messages.map(m=>({role:m.role,content:[m.content,
    ...(m.attachments ?? []).filter(a=>a.mediaType==='text/plain').map(textFileBlock)].join('\n')})))}]
  const images=messages.flatMap(m=>(m.attachments ?? []).filter(a=>a.mediaType.startsWith('image/')).map(a=>({
    type:'image',mimeType:a.mediaType,data:a.data,
  })))
  const agents=join(cwd,'.kimi-code','agents')
  await mkdir(agents,{recursive:true,mode:0o700})
  await writeFile(join(agents,'agent.md'),'---\nname: agent\ndescription: Luma\noverride: true\ntools: []\nsubagents: []\n---\n'+instruction,{mode:0o600})
  return withKimiProfile(cwd,env=>harnessProcess(cli,['acp'],{cwd,env,signal,onSpawn},async(send,lines)=>{
    let seq=0,answer='',sessionId=''
    async function rpc(method:string,params:object) {
      const id=++seq
      send(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')
      for (;;) {
        const next=await lines.next()
        if(next.done) throw Error('模型服务未收到 Kimi Code CLI 的完整回复。')
        const row=JSON.parse(next.value)
        if(row.method && row.id!==undefined) throw Error('模型服务的 Kimi 角色请求了额外权限，已停止本轮。')
        if(row.id===id) {
          if(row.error || !row.result) throw Error('模型服务未完成 Kimi CLI 请求，请检查订阅登录和模型。')
          return row.result
        }
        if(row.method!=='session/update' || row.params?.sessionId!==sessionId) continue
        const update=row.params?.update
        if(update?.sessionUpdate==='tool_call' || update?.sessionUpdate==='tool_call_update') throw Error('模型服务的 Kimi 角色尝试调用额外工具，已停止本轮。')
        if(update?.sessionUpdate==='agent_message_chunk' && update.content?.type==='text' && typeof update.content.text==='string') {
          answer+=update.content.text
          if(answer.length>200000) throw Error('模型服务的 Kimi 回复超过长度限制。')
        }
      }
    }
    const init=await rpc('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'luma-dsh',version:'1'}})
    if(images.length && init.agentCapabilities?.promptCapabilities?.image!==true) throw Error('模型服务的此版本 Kimi CLI 不支持图片。')
    const session=await rpc('session/new',{cwd,mcpServers:[]})
    if(typeof session.sessionId!=='string' || !session.sessionId) throw Error('模型服务无法建立 Kimi 会话。')
    sessionId=session.sessionId
    await rpc('session/set_model',{sessionId,modelId:model})
    const result=await rpc('session/prompt',{sessionId,prompt:[...prompt,...images]})
    if(result.stopReason!=='end_turn' || !answer.trim()) throw Error('模型服务未收到 Kimi 的完整角色回复。')
    return answer.trim()
  }))
}
