import { Worker } from 'node:worker_threads'
import { open } from 'node:fs/promises'
import { basename,extname,isAbsolute } from 'node:path'
import yauzl from 'yauzl'
import { SaxesParser } from 'saxes'
import { decodeAttachmentText, inspectChatFile, MAX_CHAT_ATTACHMENTS } from '../shared/chat-attachments.ts'

const MAX_FILE=12*1024*1024, MAX_XML=20*1024*1024, EXCERPT=12000
export type PetFileExcerpt={name:string;bytes:number;text:string;truncated:boolean}

async function officeText(bytes:Buffer,ext:string) {
  const match=ext==='.docx'?/^word\/document\.xml$/:ext==='.pptx'?/^ppt\/slides\/slide\d+\.xml$/:
    /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/
  const archive=await yauzl.fromBufferPromise(bytes,{validateEntrySizes:true})
  const zip=new Map<string,Buffer>()
  let actual=0,declared=0
  try {
    if(archive.entryCount>12000)throw Error('文档部件过多。')
    for await(const part of archive.eachEntry()){
      if(!match.test(part.fileName))continue
      if(zip.has(part.fileName))throw Error('文档含有重复的正文部件。')
      declared+=part.uncompressedSize
      if(declared>MAX_XML)throw Error('解压后的文档正文超过 20 MiB。')
      const stream=await archive.openReadStreamPromise(part)
      const chunks:Buffer[]=[]
      for await(const chunk of stream){
        actual+=chunk.length
        if(actual>MAX_XML || actual>declared)throw Error('文档实际展开长度超出限制。')
        chunks.push(chunk)
      }
      zip.set(part.fileName,Buffer.concat(chunks))
    }
  } finally { archive.close() }
  const names=[...zip.keys()].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}))
  if(!names.length)throw Error('文档缺少正文，或已加密。')
  const shared:string[]=[]
  let result='',hasText=false
  for(const name of names){
    if(result.length>EXCERPT)break
    const sharedPart=name==='xl/sharedStrings.xml', worksheet=name.startsWith('xl/worksheets/')
    if(worksheet || ext==='.pptx')result+='\n'+(worksheet?'工作表 ':'幻灯片 ')+name.match(/(\d+)\.xml$/)?.[1]+'\n'
    let capture=false,current='',kind='',inCell=false,sharedItem=''
    const parser=new SaxesParser({xmlns:true})
    parser.on('doctype',()=>{throw Error('文档含不受支持的 XML 声明。')})
    parser.on('opentag',tag=>{
      const n=tag.local
      if(n==='c' && worksheet){inCell=true;current='';kind=tag.attributes.t?.value??''}
      if(n==='si' && sharedPart)sharedItem=''
      if(n==='t' || (n==='v' && inCell))capture=true
      if(!worksheet && !sharedPart && result.length<=EXCERPT && ['tab','br'].includes(n))result+=' '
    })
    const addText=(value:string)=>{
      if(!capture)return
      if(!sharedPart && !worksheet && value.trim())hasText=true
      if(sharedPart)sharedItem+=value.slice(0,Math.max(0,EXCERPT+1-sharedItem.length))
      else if(inCell)current+=value.slice(0,Math.max(0,EXCERPT+1-current.length))
      else if(result.length<=EXCERPT)result+=value.slice(0,EXCERPT+1-result.length)
    }
    parser.on('text',addText);parser.on('cdata',addText)
    parser.on('closetag',tag=>{
      const n=tag.local
      if(n==='t' || n==='v')capture=false
      if(n==='si' && sharedPart){
        if(shared.length>=200000)throw Error('工作簿的文本项过多。')
        shared.push(sharedItem)
      }
      if(n==='c' && worksheet){
        inCell=false
        if(result.length<=EXCERPT){
          const value=kind==='s'?shared[Number(current)]??'':current
          if(value.trim())hasText=true
          result+=(value+'\t').slice(0,EXCERPT+1-result.length)
        }
      }
      if(!sharedPart && result.length<=EXCERPT && ['p','row'].includes(n))result+='\n'
    })
    parser.write(decoded(name,zip.get(name)!)).close()
  }
  return hasText?result:''
}

async function pdfText(bytes:Uint8Array):Promise<{text:string;truncated:boolean}> {
  const worker=new Worker(new URL('./pet-pdf-worker.mjs',import.meta.url),{workerData:{bytes,limit:EXCERPT},
    execArgv:[],resourceLimits:{maxOldGenerationSizeMb:160,maxYoungGenerationSizeMb:24}})
  let timer:ReturnType<typeof setTimeout>|undefined
  try {
    return await new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('PDF 读取超时，请选择较小的文档。')),12000)
      worker.once('message',value=>value.error?reject(Error(value.error)):resolve(value))
      worker.once('error',()=>reject(Error('PDF 读取失败或超过资源限制。')))
      worker.once('exit',()=>reject(Error('PDF 读取已中止。')))
    })
  }finally{clearTimeout(timer);await worker.terminate()}
}

function decoded(name:string,data:Uint8Array) {
  if(data[0]===255 && data[1]===254)return new TextDecoder('utf-16le',{fatal:true}).decode(data)
  if(data[0]===254 && data[1]===255)return new TextDecoder('utf-16be',{fatal:true}).decode(data)
  return decodeAttachmentText(name,data)
}

export async function readPetFiles(paths:readonly string[]):Promise<PetFileExcerpt[]> {
  if(!paths.length || paths.length>MAX_CHAT_ATTACHMENTS)throw Error('每次可投递 1 至 4 个文件。')
  const excerpts:PetFileExcerpt[]=[]
  for(const path of paths){
    if(!isAbsolute(path))throw Error('请选择完整的文件路径。')
    const name=basename(path),ext=extname(name).toLowerCase(),office=['.docx','.xlsx','.pptx'].includes(ext)
    let file
    try{
      file=await open(path,'r')
      const stat=await file.stat()
      if(!stat.isFile() || !stat.size || stat.size>MAX_FILE)throw Error('请选择 12 MiB 以内的非空普通文件。')
      if(!office && ext!=='.pdf'){
        let type
        try{type=inspectChatFile({name,type:'',size:stat.size},false).mediaType}catch{}
        if(type!=='text/plain')throw Error('请选择文本、带文本层的 PDF、DOCX、XLSX 或 PPTX。')
      }
      // Reading into a fixed-size buffer also bounds a file growing after stat.
      const bytes=Buffer.alloc(stat.size+1)
      let used=0
      while(used<bytes.length){const next=await file.read(bytes,used,bytes.length-used,used);if(!next.bytesRead)break;used+=next.bytesRead}
      if(used!==stat.size)throw Error('文件在读取期间有变化，请重新投递。')
      const data=bytes.subarray(0,used)
      let raw:string,partial=false
      if(office){try{raw=await officeText(data,ext)}catch{throw Error('无法读取 Office 正文，文件可能已加密、损坏或超过解压限制。')}}
      else if(ext==='.pdf'){
        const parsed=await pdfText(data)
        raw=parsed.text;partial=parsed.truncated
        if(!raw.trim())throw Error('PDF 中没有可读文本层，扫描件请先转为文字。')
      }else raw=decoded(name,data)
      if(/[\u0000-\u0008\u000b\u000e-\u001f]/.test(raw))throw Error('文件含二进制内容，请选择文本或 Office 文档。')
      const text=raw.slice(0,EXCERPT).trim()
      if(!text)throw Error('没有提取到可读正文。')
      excerpts.push({name,bytes:used,text,truncated:partial || raw.length>EXCERPT})
    }catch(error){
      const message=error instanceof Error && !('code' in error)?error.message:'请检查文件是否可读。'
      throw Error(name+'：'+message)
    }finally{await file?.close()}
  }
  return excerpts
}
