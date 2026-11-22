import { textFileBlock, type ChatAttachment } from '../shared/chat-attachments.ts'
import { providerUsageTotal } from './employee-usage.ts'
import { customThinking, type ModelProtocol, type ModelOption } from '../shared/role-models.ts'
export type { ModelProtocol } from '../shared/role-models.ts'
export type TextMessage = { role:string; content:string; attachments?: readonly ChatAttachment[] }
type Service = {protocol?:ModelProtocol; model:string; baseUrl:string; effort?:string}
export function modelProtocol(value:unknown):ModelProtocol {
  if(value===undefined || value==='openai') return 'openai'
  if(value==='anthropic' || value==='gemini') return value
  throw Error('请选择支持的模型协议。')
}
export function modelBaseUrl(url:URL, protocol:ModelProtocol):string {
  const endpoint = {
    openai: /\/chat\/completions$/,
    anthropic: /\/messages$/,
    gemini: /\/models\/[^/]+:generateContent$/,
  }[protocol]
  const basePath = url.pathname.replace(/\/+$/, '').replace(endpoint, '').replace(/\/models$/, '')
  return url.origin + basePath
}
function messageParts(message: TextMessage, protocol: ModelProtocol): object[] {
  const text = (value: string) => protocol === 'gemini' ? {text:value} : {type:'text', text:value}
  const parts: object[] = message.content ? [text(message.content)] : []
  for (const item of message.attachments ?? []) {
    if (item.mediaType === 'text/plain') { parts.push(text(textFileBlock(item))); continue }
    if (protocol === 'gemini') parts.push({inlineData:{mimeType:item.mediaType, data:item.data}})
    else if (protocol === 'anthropic') parts.push({type:item.mediaType === 'application/pdf' ? 'document' : 'image',
      source:{type:'base64', media_type:item.mediaType, data:item.data}})
    else {
      const url = 'data:' + item.mediaType + ';base64,' + item.data
      parts.push(item.mediaType === 'application/pdf' ? {type:'file', file:{filename:item.name, file_data:url}}
        : {type:'image_url', image_url:{url}})
    }
  }
  return parts
}
function providerHeaders(protocol: ModelProtocol, key: string) {
  const headers:Record<string,string> = {'Content-Type':'application/json'}
  if (protocol === 'anthropic') headers['anthropic-version']='2023-06-01'
  if (key) {
    if (protocol === 'anthropic') headers['x-api-key']=key
    else if (protocol === 'gemini') headers['x-goog-api-key']=key
    else headers.Authorization='Bearer '+key
  }
  return headers
}
export async function discoverEmployeeModels(protocol:ModelProtocol, baseUrl:string, key:string):Promise<ModelOption[]> {
  const url = new URL(baseUrl+'/models')
  const signal=AbortSignal.timeout(15000), models=new Map<string,ModelOption>()
  const seen=new Set<string>()
  for (;;) {
    const response=await fetch(url,{headers:providerHeaders(protocol,key),redirect:'error',signal})
    if (!response.ok) throw Error('模型服务读取列表时返回 HTTP '+response.status+'。可手填模型标识。')
    const data=await response.json()
    const list=protocol==='gemini' ? data.models : data.data
    if (!Array.isArray(list)) throw Error('模型服务没有提供可识别的列表，可手填模型标识。')
    for (const item of list) {
      if (!item || (protocol==='gemini' && Array.isArray(item.supportedGenerationMethods) && !item.supportedGenerationMethods.includes('generateContent'))) continue
      const id=protocol==='gemini' ? item.name?.replace(/^models\//,'') : item.id
      if (typeof id!=='string' || !id.trim() || id.length>180) continue
      const label=item.displayName ?? item.display_name ?? item.name
      models.set(id,{id,name:typeof label==='string' && label.length<=240 ? label : id})
    }
    const next=protocol==='gemini' ? data.nextPageToken : protocol==='anthropic' && data.has_more ? data.last_id : undefined
    if (typeof next!=='string' || !next || seen.has(next) || seen.size>=49) break
    seen.add(next)
    url.searchParams.set(protocol==='gemini'?'pageToken':'after_id',next)
  }
  return [...models.values()]
}
export async function requestEmployeeModel(service:Service, key:string, messages:TextMessage[], signal:AbortSignal, onUsage?: (tokens:number) => void):Promise<string> {
  const protocol = modelProtocol(service.protocol)
  const headers=providerHeaders(protocol,key)
  let path:string, payload:object
  const system = messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')
  const conversation = messages.filter(m=>m.role!=='system')
  const wire = (m: TextMessage) => {
    if (!m.attachments?.length) return {role:m.role, content:m.content}
    if (m.attachments.every(item => item.mediaType === 'text/plain')) {
      return {role:m.role, content:[m.content, ...m.attachments.map(textFileBlock)].filter(Boolean).join('\n\n')}
    }
    return {role:m.role, content:messageParts(m, protocol)}
  }
  if(protocol==='anthropic') {
    path='/messages'
    payload={model:service.model,system,messages:conversation.map(wire),max_tokens:4096}
  } else if(protocol==='gemini') {
    path='/models/'+encodeURIComponent(service.model.replace(/^models\//,''))+':generateContent'
    payload={systemInstruction:{parts:[{text:system}]},contents:conversation.map(m=>({role:m.role==='assistant'?'model':'user',parts:messageParts(m, protocol)}))}
  } else {
    path='/chat/completions'
    payload={model:service.model,messages:messages.map(wire),stream:false}
  }
  const body = JSON.stringify({...payload,...customThinking(protocol,service.model,service.effort)})
  const response=await fetch(modelBaseUrl(new URL(service.baseUrl),protocol)+path,{method:'POST',redirect:'error',headers,body,signal})
  if(!response.ok) throw Error('模型服务返回 HTTP '+response.status+(messages.some(m=>m.attachments?.length) && [400,413,415,422].includes(response.status)
    ? '，请确认模型支持所选附件的格式与大小。' : '，请检查这位员工的服务设置。'))
  const data=await response.json()
  const tokens = providerUsageTotal(protocol, data)
  if (tokens !== undefined) onUsage?.(tokens)
  const parts = protocol==='anthropic' ? data.content : data.candidates?.[0]?.content?.parts
  const answer = protocol==='openai' ? data.choices?.[0]?.message?.content :
    Array.isArray(parts) && parts.filter(p=>p && !p.thought && (protocol!=='anthropic' || p.type==='text') && typeof p.text==='string').map(p=>p.text).join('\n')
  if(typeof answer!=='string' || !answer.trim() || answer.length>200000) throw Error('模型服务没有返回可用的文字结果。')
  return answer
}
