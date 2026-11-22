import { randomUUID } from 'node:crypto'
import { textFileBlock } from '../shared/chat-attachments.ts'
import { dshUsageTotal } from './employee-usage.ts'
import type { ModelOption } from '../shared/role-models.ts'
import type { TextMessage } from './employee-model.ts'

type Reasoning = { efforts: ModelOption[]; defaultEffort?: string }
export interface NativeModels {
  llm: {
    listProviders(): readonly ModelOption[]
    listModels(provider: string): Promise<readonly ModelOption[]>
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<{reasoning?: Reasoning; inputModalities?: readonly string[]}>
    stream(options: object): AsyncIterable<{type:string; index?:number; text?:string; usage?:unknown; block?:{type:string; text?:string}; reason?:{kind:string}}>
  }
  attachments?: {saveImages(inputs: {name:string; mediaType:string; data:Buffer}[]): Promise<readonly object[]>}
}
export async function requestDshModel(native: NativeModels, service: {provider:string; model:string; effort:string}, messages: TextMessage[], signal: AbortSignal, onUsage?: (tokens:number) => void) {
  const {provider,model,effort} = service
  const wire = []
  const visible = new Map<number, string>()
  let finished = false
  try {
    if (messages.some(message=>message.attachments?.some(file=>file.mediaType.startsWith('image/')))) {
      const {inputModalities}=await native.llm.resolveModelInfo(provider,model,signal)
      if (inputModalities && !inputModalities.includes('image')) throw Error('模型服务标注所选 DSH 模型仅接收文字，请更换支持图片的模型。')
    }
    for (const message of messages.filter(m=>m.role!=='system')) {
      const content: object[] = message.content ? [{type:'text', text:message.content}] : []
      const files = message.attachments ?? []
      const images = files.filter(file=>file.mediaType.startsWith('image/'))
      if (images.length && !native.attachments) throw Error('模型服务未提供 DSH 图片存储。')
      const refs = images.length ? await native.attachments!.saveImages(images.map(file=>({
        name:file.name, mediaType:file.mediaType, data:Buffer.from(file.data,'base64'),
      }))) : []
      let index = 0
      for (const file of files) {
        if (file.mediaType === 'text/plain') content.push({type:'text',text:textFileBlock(file)})
        else if (file.mediaType.startsWith('image/')) content.push({type:'image',attachment:refs[index++]})
        else throw Error('模型服务的 DSH 路由支持文本和图片。该附件可通过支持此格式的自定义服务发送。')
      }
      wire.push({id:randomUUID(), role:message.role, content, source:message.role==='assistant' ? {kind:'model',provider,model} : {kind:'user'}})
    }
    signal.throwIfAborted()
    const options = {provider, model, ...(effort ? {reasoningEffort:effort} : {}), signal, messages:wire,
      system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')}
    for await (const chunk of native.llm.stream(options)) {
      if (chunk.type === 'usage') {
        const tokens = dshUsageTotal(chunk.usage)
        if (tokens !== undefined) onUsage?.(tokens)
      }
      if (chunk.type === 'text-delta' && typeof chunk.index === 'number' && typeof chunk.text === 'string') {
        const part=(visible.get(chunk.index) ?? '')+chunk.text
        if (part.length>200000) throw Error('模型服务返回的文字过长。')
        visible.set(chunk.index,part)
      }
      if (chunk.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.index === 'number') {
        visible.set(chunk.index, chunk.block.text ?? '')
      }
      if (chunk.type === 'finish') finished = chunk.reason?.kind==='stop' || chunk.reason?.kind==='max-tokens'
    }
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (error instanceof Error && error.message.startsWith('模型服务')) throw error
    throw Error('模型服务调用失败，请检查 DSH 中的服务、模型与思考强度。')
  }
  const answer = [...visible.entries()].sort(([a],[b])=>a-b).map(([,value])=>value).join('\n')
  if (!finished || !answer.trim() || answer.length>200000) throw Error('模型服务未完成可用的文字回复，请检查 DSH 中的服务与模型设置。')
  return answer
}
