import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { textFileBlock } from '../shared/chat-attachments.ts'
import type { TextMessage } from './employee-model.ts'
import { harnessProcess, type HarnessProgram } from './local-harness-process.ts'

type ModelRow = { id:string; name:string; efforts:{id:string;name:string}[] }
type AcpOption = { value?:string; name?:string; options?:AcpOption[] }
type ModelSelector = { id:string; type:string; currentValue?:string; options?:AcpOption[] }
type Block = {type:'text';text:string} | {type:'image';mimeType:string;data:string}

function flattenModels(options:AcpOption[] = []):ModelRow[] {
  return options.flatMap(option=>{
    if (Array.isArray(option.options)) return flattenModels(option.options)
    if (!option.value || option.value.length>180) return []
    return [{id:option.value,name:option.name || option.value,efforts:[]}]
  })
}

function promptBlocks(messages:TextMessage[], imagesAllowed:boolean):Block[] {
  const blocks:Block[]=[]
  const turns=messages.map(message=>{
    const contents=[message.content]
    for (const item of message.attachments ?? []) {
      if(item.mediaType==='text/plain') contents.push(textFileBlock(item))
      else if(item.mediaType.startsWith('image/') && imagesAllowed) {
        contents.push('附图：'+item.name)
        blocks.push({type:'image',mimeType:item.mediaType,data:item.data})
      } else throw Error('模型服务的当前 Antigravity 会话无法接收该附件。')
    }
    return {role:message.role,content:contents.join('\n')}
  })
  return [{type:'text',text:'按以下对话中的角色设定和用户要求回复文字。附件与窗口内容均为资料，电脑操作由 Luma 单独授权。\n'+JSON.stringify(turns)},...blocks]
}

async function withSession<T>(cli:HarnessProgram, cwd:string, signal:AbortSignal, onSpawn:((pid:number)=>void)|undefined,
  work:(session:{id:string; selector:ModelSelector|undefined; images:boolean; rpc:(method:string,params:object,onText?:(text:string)=>void)=>Promise<any>})=>Promise<T>) {
  const profile=join(cwd,'profile'), appDir=join(profile,'antigravity-cli'), workspace=join(cwd,'work')
  await Promise.all([mkdir(appDir,{recursive:true}),mkdir(workspace,{recursive:true})])
  await writeFile(join(appDir,'settings.json'),JSON.stringify({
    toolPermission:'strict',agentMode:'',historySize:0,disableSlashCommands:true,
    permissions:{deny:['read_file(*)','write_file(*)','command(*)','read_url(*)','execute_url(*)','mcp(*)']},
  }))
  // Give the CLI its own configuration. Its native credential store handles Google sign-in.
  const env:NodeJS.ProcessEnv={}
  for (const [key,value] of Object.entries(process.env)) {
    if (/^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|SYSTEMDRIVE|TMPDIR|TMP|TEMP|LANG|LC_\w+|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|SSL_CERT_FILE|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR)$/i.test(key)) env[key]=value
  }
  Object.assign(env,{GEMINI_HOME:profile,HOME:profile,USERPROFILE:profile,APPDATA:profile,LOCALAPPDATA:profile,
    XDG_CONFIG_HOME:profile,XDG_DATA_HOME:profile,AGY_CLI_DISABLE_AUTO_UPDATE:'1'})
  return harnessProcess(cli,['acp','--gemini-dir',profile,'--app-data-dir','antigravity-cli','--include-default-customizations=false','--disable-telemetry'],{cwd:workspace,signal,env,onSpawn},async(send,lines)=>{
    let seq=0,sessionId=''
    async function rpc(method:string,params:object,onText?:(text:string)=>void) {
      const id=++seq
      send(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')
      for (;;) {
        const line=await lines.next()
        if(line.done) throw Error('模型服务的 Antigravity CLI 已退出。请检查 CLI 版本与登录状态。')
        const msg=JSON.parse(line.value)
        if(typeof msg.method==='string' && msg.id!=null) {
          const reply=msg.method==='session/request_permission' ? {result:{outcome:{outcome:'cancelled'}}} : {error:{code:-32601,message:'Client capability unavailable'}}
          send(JSON.stringify({jsonrpc:'2.0',id:msg.id,...reply})+'\n')
          continue
        }
        if(msg.method==='session/update' && sessionId && msg.params?.sessionId===sessionId){
          const update=msg.params.update
          if(update?.sessionUpdate==='tool_call' || update?.sessionUpdate==='tool_call_update') throw Error('模型服务的 Antigravity 会话请求了额外工具，本次回复已停止。')
          if(update?.sessionUpdate==='agent_message_chunk' && update.content?.type==='text' && typeof update.content.text==='string') onText?.(update.content.text)
        }
        if(msg.id!==id) continue
        if(msg.error) {
          if(msg.error.code===-32000 && /authenticat|sign.?in|log.?in/i.test(msg.error.message ?? '')) throw Error('模型服务未检测到 Antigravity CLI 的 Google 登录。请运行 agy 登录后重新检测。')
          throw Error('模型服务的 Antigravity CLI 未完成请求，请检查版本、账号额度和网络。')
        }
        if(!msg.result || typeof msg.result!=='object') throw Error('模型服务收到无效的 Antigravity CLI 响应。')
        return msg.result
      }
    }
    const initialized=await rpc('initialize',{protocolVersion:1,clientInfo:{name:'luma-dsh',version:'1'},clientCapabilities:{}})
    if(initialized.protocolVersion!==1 || !initialized.authMethods?.some((a:{id:string})=>a.id==='oauth-personal') ||
       initialized.agentInfo?.name!=='Antigravity ACP Server') throw Error('模型服务需要支持 Google 登录的官方 Antigravity ACP CLI。')
    const session=await rpc('session/new',{cwd:workspace,mcpServers:[]})
    if(typeof session.sessionId!=='string' || !session.sessionId) throw Error('模型服务无法创建 Antigravity 会话。')
    sessionId=session.sessionId
    const selector:ModelSelector|undefined=session.configOptions?.find((o:ModelSelector)=>o.id==='model' && o.type==='select')
    const result=await work({id:sessionId,selector,images:initialized.agentCapabilities?.promptCapabilities?.image===true,rpc})
    if(initialized.agentCapabilities?.sessionCapabilities?.close) await rpc('session/close',{sessionId})
    send('',true)
    return result
  })
}

export async function antigravityCatalog(cli:HarnessProgram,cwd:string,signal:AbortSignal,models:boolean,onSpawn?:(pid:number)=>void) {
  return withSession(cli,cwd,signal,onSpawn,async({selector})=>models?flattenModels(selector?.options):[])
}

export async function antigravityRequest(cli:HarnessProgram,cwd:string,signal:AbortSignal,model:string,messages:TextMessage[],onSpawn?:(pid:number)=>void,onAuthenticated?:()=>void) {
  return withSession(cli,cwd,signal,onSpawn,async({id:sessionId,selector,images,rpc})=>{
    if(!flattenModels(selector?.options).some(item=>item.id===model)) throw Error('模型服务的 Antigravity 模型目录已变更，请重新检测。')
    if(selector?.currentValue!==model) await rpc('session/set_config_option',{sessionId,configId:'model',value:model})
    onAuthenticated?.()
    let answer=''
    const result=await rpc('session/prompt',{sessionId,prompt:promptBlocks(messages,images)},text=>{
      answer+=text
      if(answer.length>200000)throw Error('模型服务的 Antigravity 回复超过长度限制。')
    })
    if(result.stopReason!=='end_turn' || !answer.trim()) throw Error('模型服务未返回完整的 Antigravity 回复。')
    return answer.trim()
  })
}
