export type ModelProtocol = 'openai' | 'anthropic' | 'gemini'
type TextMessage = { role:string; content:string }
type Service = {protocol?:ModelProtocol; model:string; baseUrl:string}
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
  const basePath = url.pathname.replace(/\/+$/, '').replace(endpoint, '')
  return url.origin + basePath
}
export async function requestEmployeeModel(service:Service, key:string, messages:TextMessage[], signal:AbortSignal):Promise<string> {
  const protocol = modelProtocol(service.protocol)
  const headers:Record<string,string> = {'Content-Type':'application/json'}
  let path:string, payload:object
  const system = messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')
  const conversation = messages.filter(m=>m.role!=='system')
  if(protocol==='anthropic') {
    path='/messages'
    headers['anthropic-version']='2023-06-01'
    if(key) headers['x-api-key']=key
    payload={model:service.model,system,messages:conversation,max_tokens:4096}
  } else if(protocol==='gemini') {
    path='/models/'+encodeURIComponent(service.model.replace(/^models\//,''))+':generateContent'
    if(key) headers['x-goog-api-key']=key
    payload={systemInstruction:{parts:[{text:system}]},contents:conversation.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}))}
  } else {
    path='/chat/completions'
    if(key) headers.Authorization='Bearer '+key
    payload={model:service.model,messages,stream:false}
  }
  const response=await fetch(modelBaseUrl(new URL(service.baseUrl),protocol)+path,{method:'POST',redirect:'error',headers,body:JSON.stringify(payload),signal})
  if(!response.ok) throw Error('模型服务返回 HTTP '+response.status+'，请检查这位员工的服务设置。')
  const data=await response.json()
  const parts = protocol==='anthropic' ? data.content : data.candidates?.[0]?.content?.parts
  const answer = protocol==='openai' ? data.choices?.[0]?.message?.content :
    Array.isArray(parts) && parts.filter(p=>p && !p.thought && (protocol!=='anthropic' || p.type==='text') && typeof p.text==='string').map(p=>p.text).join('\n')
  if(typeof answer!=='string' || !answer.trim() || answer.length>200000) throw Error('模型服务没有返回可用的文字结果。')
  return answer
}
