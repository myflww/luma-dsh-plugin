import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { createAgentWork } from '../src/host/agent-work.ts'
import { inspectChatFile, validateChatAttachments, MAX_ATTACHMENT_BYTES } from '../src/shared/chat-attachments.ts'

const attachment = (name, mediaType, bytes) => ({name, mediaType, bytes:bytes.length, data:bytes.toString('base64')})
const image = attachment('像素.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQmbAbAAIbAWC6n0m1AAAAAElFTkSuQmCC','base64'))
const note = attachment('清单.csv','text/plain',Buffer.from('颜色,数量\n紫色,七'))
const pdfBody = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n'
const offsets = [1,2,3].map(n => String(pdfBody.indexOf(n + ' 0 obj')).padStart(10, '0') + ' 00000 n \n')
const pdfBytes = (body) => Buffer.from(body + 'xref\n0 4\n0000000000 65535 f \n' +
  offsets.join('') + 'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n' + body.length + '\n%%EOF\n')
const pdf = attachment('稿.pdf','application/pdf',pdfBytes(pdfBody))

test('validates names, format signatures, encoding, count and size at the host boundary', () => {
  assert.deepEqual(validateChatAttachments([image,note,pdf]), [image,note,pdf])
  assert.throws(() => validateChatAttachments([{...note, name:'../secret'}]), /名称/)
  assert.throws(() => validateChatAttachments([{...image, data:note.data, bytes:note.bytes}]), /格式不符/)
  assert.throws(() => validateChatAttachments([attachment('bad.txt','text/plain',Buffer.from([0xff]))]), /UTF-8/)
  assert.throws(() => validateChatAttachments(Array(5).fill(note)), /4 个/)
  assert.throws(() => validateChatAttachments([{...note, bytes:1e5}]), /64 KiB/)
  assert.throws(() => validateChatAttachments([{...image, bytes:MAX_ATTACHMENT_BYTES + 1}]), /4 MiB/)
  assert.throws(() => inspectChatFile({name:'notes.pdf',type:'application/pdf',size:40}, true), /DSH 会话/)
  assert.equal(inspectChatFile({name:'clipboard',type:'image/png',size:68}, true).mediaType,'image/png')
  assert.equal(validateChatAttachments([attachment('旧表.csv','text/plain',Buffer.from([0xff,0xfe]))], true)[0].mediaType,'application/octet-stream')
})

test('group handoff sends the actual image, text and PDF to all three protocols; private attachment-only retries keep the original bytes', async t => {
  const root = await mkdtemp(join(tmpdir(),'luma-attachment-'))
  const desk = createAgentWork(root)
  const calls = []
  const provider = createServer(async (req,res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    calls.push(JSON.parse(Buffer.concat(chunks)))
    res.end(JSON.stringify({choices:[{message:{content:'received'}}],content:[{type:'text',text:'received'}],candidates:[{content:{parts:[{text:'received'}]}}]}))
  }).listen(0,'127.0.0.1')
  await once(provider,'listening')
  t.after(async () => {
    desk.dispose(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve))
    await rm(root,{recursive:true,force:true})
  })
  const roles = ['shan','lu-mi','gemini']
  for (const [i,protocol] of ['openai','anthropic','gemini'].entries()) await desk.call('configure', {
    roleId:roles[i], protocol, model:'local-stub', baseUrl:'http://127.0.0.1:'+provider.address().port,
  })
  async function done(id) {
    for (let i=0; i<250; i++) {
      const job = (await desk.call('state',{})).jobs.find(j => j.id === id)
      if (!['running','queued'].includes(job?.status)) { assert.equal(job?.status,'done',job?.error); return job }
      await delay(15)
    }
    assert.fail('timed out')
  }
  const room = await desk.call('createroom',{requestId:'room',roleIds:roles,name:'文件审阅'})
  const request = {requestId:'review',topic:room.id,mode:'team',roleIds:roles,text:'检查附件',attachments:[image,note,pdf]}
  const host = createServer(desk.handler).listen(0,'127.0.0.1')
  await once(host,'listening')
  t.after(async () => {host.closeAllConnections(); await new Promise(resolve => host.close(resolve))})
  const origin = 'http://127.0.0.1:' + host.address().port
  const post = (action, value) => fetch(origin + '/luma-agents/' + action, {method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(value)})
  assert.equal((await post('run',request)).status,200)
  const history = await done('review')
  assert.equal(history.attachments[1].name,'清单.csv')
  assert.ok(!JSON.stringify(history).includes(image.data))
  const [openai,anthropic,gemini] = calls
  assert.deepEqual(openai.messages.at(-1).content.slice(1), [
    {type:'image_url',image_url:{url:'data:image/png;base64,'+image.data}},
    {type:'text',text:'附件「清单.csv」\n颜色,数量\n紫色,七'},
    {type:'file',file:{filename:pdf.name,file_data:'data:application/pdf;base64,'+pdf.data}},
  ])
  assert.deepEqual(anthropic.messages.at(-1).content.slice(1), [
    {type:'image',source:{type:'base64',media_type:'image/png',data:image.data}},
    {type:'text',text:'附件「清单.csv」\n颜色,数量\n紫色,七'},
    {type:'document',source:{type:'base64',media_type:'application/pdf',data:pdf.data}},
  ])
  assert.deepEqual(gemini.contents.at(-1).parts.slice(1), [
    {inlineData:{mimeType:'image/png',data:image.data}}, {text:'附件「清单.csv」\n颜色,数量\n紫色,七'},
    {inlineData:{mimeType:'application/pdf',data:pdf.data}},
  ])
  const direct = {...request,requestId:'private',roleIds:['shan'],mode:'chat',topic:'desk-shan',text:'',attachments:[note]}
  await desk.call('run',direct); await done('private'); await desk.call('run',direct)
  assert.equal(calls.length,4)
  assert.equal(calls.at(-1).messages.at(-1).content,'附件「清单.csv」\n颜色,数量\n紫色,七')
  await assert.rejects(desk.call('run',{...direct,attachments:[attachment(note.name,note.mediaType,Buffer.from('changed'))]}), /编号/)
  const large = attachment('large.pdf','application/pdf',pdfBytes(pdfBody + '%'+ ' '.repeat(1024 * 1024) + '\n'))
  const bigRequest = {...direct,requestId:'file-through-host',attachments:[large]}
  assert.equal((await post('run',bigRequest)).status,200)
  await done('file-through-host')
  assert.equal(calls.at(-1).messages.at(-1).content[0].file.file_data,'data:application/pdf;base64,'+large.data)
  assert.equal((await post('memory',bigRequest)).status,400)
})
