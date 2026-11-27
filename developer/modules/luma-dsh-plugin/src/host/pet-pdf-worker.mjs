import { parentPort,workerData } from 'node:worker_threads'
import { getDocumentProxy } from 'unpdf'

try {
  const {bytes,limit}=workerData
  const pdf=await getDocumentProxy(bytes,{isEvalSupported:false,useWorkerFetch:false,useWasm:false,
    useSystemFonts:false,disableFontFace:true,enableXfa:false,verbosity:0})
  let text='',truncated=false
  try {
    const pages=Math.min(pdf.numPages,60)
    for(let n=1;n<=pages && text.length<=limit;n++){
      const page=await pdf.getPage(n)
      const reader=page.streamTextContent().getReader()
      try {
        while(text.length<=limit){
          const {value,done}=await reader.read()
          if(done)break
          for(const item of value.items){
            if(typeof item.str!=='string')continue
            text+=(item.str+(item.hasEOL?'\n':' ')).slice(0,limit+1-text.length)
            if(text.length>limit)break
          }
        }
      }finally{await reader.cancel();page.cleanup()}
      if(text.length && text.length<=limit)text+='\n'
    }
    truncated=text.length>limit || pdf.numPages>pages
  }finally{await pdf.loadingTask.destroy()}
  parentPort.postMessage({text,truncated})
}catch{parentPort.postMessage({error:'PDF 正文无法读取，文件可能已加密或损坏。'})}
