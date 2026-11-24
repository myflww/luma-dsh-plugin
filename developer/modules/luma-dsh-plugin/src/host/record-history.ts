import type { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import type { createJobDeletion } from './job-deletion.ts'

type Entry = { id:string; topic:string; mode:string; roleIds:string[]; text:string; createdAt:number; status:string; steps:{roleId:string}[]; attachments?:{name:string}[] }
type Letter = { id:string; role:string; topic:string; text:string; time:number }
type Target = {kind:'job'|'topic'; id?:string; roleId?:string; roomId?:string; topic?:string}
const active=(job:Entry)=>job.status==='queued' || job.status==='running'
const key=(role:string,topic:string,id:string)=>createHash('sha256').update(JSON.stringify([role,topic,id])).digest('hex')
const denied=()=>Error('记录不存在，或当前角色没有访问权限。')

export function createRecordHistory<J extends Entry,L extends Letter>(
  db:DatabaseSync, jobs:Map<string,J>, rooms:Map<string,{roleIds:string[]}>,
  deleted:ReturnType<typeof createJobDeletion>, letters:()=>L[],
  omitUpload:(role:string,note:string)=>void,
) {
  db.exec("CREATE TABLE IF NOT EXISTS record_archives(kind TEXT NOT NULL,owner TEXT NOT NULL,target TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(kind,owner,target));"+
    "CREATE TABLE IF NOT EXISTS deleted_record_access(id TEXT PRIMARY KEY,room TEXT NOT NULL,roles TEXT NOT NULL,batch TEXT NOT NULL DEFAULT '');"+
    "CREATE TABLE IF NOT EXISTS deleted_record_letters(batch TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(batch,id));"+
    "CREATE TABLE IF NOT EXISTS deleted_local_topics(role TEXT NOT NULL,topic TEXT NOT NULL,PRIMARY KEY(role,topic));")
  if(!db.prepare('PRAGMA table_info(deleted_record_access)').all().some(column=>column.name==='batch'))
    db.exec("ALTER TABLE deleted_record_access ADD COLUMN batch TEXT NOT NULL DEFAULT ''")
  db.exec("CREATE INDEX IF NOT EXISTS deleted_record_batch ON deleted_record_access(batch)")
  const archive=db.prepare('INSERT OR IGNORE INTO record_archives VALUES(?,?,?,?)')
  const restore=db.prepare('DELETE FROM record_archives WHERE kind=? AND owner=? AND target=?')
  const archived=db.prepare('SELECT at FROM record_archives WHERE kind=? AND owner=? AND target=?')
  const removedTopic=db.prepare('SELECT 1 FROM deleted_local_topics WHERE role=? AND topic=?')
  function visibility(){
    const hiddenJobs=new Set<string>(), topics=new Set<string>()
    for(const row of db.prepare('SELECT kind,owner,target FROM record_archives').all())
      if(row.kind==='job') hiddenJobs.add(String(row.target)); else topics.add(JSON.stringify([row.owner,row.target]))
    const job=(j:J)=>!hiddenJobs.has(j.id) && !(j.roleIds.length===1 && topics.has(JSON.stringify([j.roleIds[0],j.topic])))
    const letter=(l:L)=>!l.topic.startsWith('desk:') || !topics.has(JSON.stringify([l.role,l.topic.slice(5)]))
    const hiddenNotes=new Set<string>()
    if(hiddenJobs.size || topics.size) {
      for(const j of jobs.values()) if(!job(j)) for(const owner of j.roleIds) hiddenNotes.add(key(owner,j.topic,j.id))
      for(const l of letters()) if(!letter(l)) hiddenNotes.add(key(l.role,'outreach','letter-'+l.id))
    }
    return {
      job, letter, note:(id:string)=>!hiddenNotes.has(id),
    }
  }
  function topicClosed(role:string,topic:string) {
    return Boolean(removedTopic.get(role,topic) || archived.get('topic',role,topic))
  }
  function assertCanRun(id:string,roleIds:string[],topic:string) {
    if (archived.get('job','',id)) throw Error('这条记录已归档，请先恢复。')
    if (!rooms.has(topic) && roleIds.length===1 && topicClosed(roleIds[0]!,topic))
      throw Error('这个独立话题已归档或删除，请恢复归档或开启新话题。')
  }
  function scope(t:Target,unlocked:readonly string[]) {
    if (Boolean(t.roleId)===Boolean(t.roomId)) throw denied()
    if (t.roleId && !unlocked.includes(t.roleId)) throw denied()
    if (t.roomId && !rooms.get(t.roomId)?.roleIds.every(id=>unlocked.includes(id))) throw denied()
  }
  function inScope(roles:string[],room:string,t:Target,unlocked:readonly string[]) {
    return roles.every(id=>unlocked.includes(id)) && (t.roomId ? t.roomId===room : !room && roles.includes(t.roleId!))
  }
  const localLetters=(owner:string,topic:string)=>letters().filter(l=>l.role===owner && l.topic==='desk:'+topic)
  const topicJobs=(owner:string,topic:string)=>[...jobs.values()].filter(j=>j.topic===topic && j.roleIds.length===1 && j.roleIds[0]===owner)
  function clearNote(owner:string,topic:string,id:string) {
    const note=key(owner,topic,id)
    omitUpload(owner,note)
    db.prepare('DELETE FROM notes WHERE role=? AND topic=? AND id=?').run(owner,topic,note)
    db.prepare('DELETE FROM portrait_turns WHERE role=? AND event=?').run(owner,note)
  }
  function eraseLetters(owner:string,topic:string,batch:string) {
    for(const row of db.prepare('SELECT id FROM companion_letters WHERE role=? AND topic=?').all(owner,'desk:'+topic)) {
      clearNote(owner,'outreach','letter-'+row.id)
      db.prepare('INSERT OR IGNORE INTO deleted_record_letters VALUES(?,?)').run(batch,String(row.id))
    }
    db.prepare('DELETE FROM companion_letters WHERE role=? AND topic=?').run(owner,'desk:'+topic)
  }
  function eraseJob(job:J,batch:string) {
    for(const owner of job.roleIds) clearNote(owner,job.topic,job.id)
    const names=job.mode==='chat'?[]:job.steps.map((s,i)=>(i+1)+'-'+s.roleId+'.md')
    deleted.mark(job.id,names)
    db.prepare('INSERT INTO deleted_record_access(id,room,roles,batch) VALUES(?,?,?,?)').run(job.id,rooms.has(job.topic)?job.topic:'',JSON.stringify(job.roleIds),batch)
    db.prepare('DELETE FROM jobs WHERE id=?').run(job.id)
    restore.run('job','',job.id)
  }
  function view(t:Target,selected:J[],mail:L[],at:number) {
    const first=selected[0]
    return {kind:t.kind,...(t.id?{id:t.id}:{}),topic:t.topic ?? first?.topic ?? '',
      ...(t.roleId?{roleId:t.roleId}:{}),...(t.roomId?{roomId:t.roomId}:{}),
      roleIds:t.kind==='topic'?[t.roleId!]:first!.roleIds,title:(first?.text.trim() || first?.attachments?.[0]?.name || mail[0]?.text || '独立话题').slice(0,80),
      archivedAt:at,count:selected.length+mail.length,...(t.kind==='job'?{mode:first!.mode}:{})}
  }
  function deletionReceipt(batch:string,single?:string) {
    const jobIds=single?[single]:db.prepare('SELECT id FROM deleted_record_access WHERE batch=? ORDER BY rowid').all(batch).map(row=>String(row.id))
    const letterIds=db.prepare('SELECT id FROM deleted_record_letters WHERE batch=? ORDER BY rowid').all(batch).map(row=>String(row.id))
    let pending=false
    for(const id of jobIds) if(!deleted.cleanup(id)) pending=true
    return {ok:true,filesPending:pending,removed:{jobs:jobIds,letters:letterIds}}
  }
  function list(t:Target,unlocked:readonly string[]) {
    scope(t,unlocked)
    const result=[]
    for(const row of db.prepare('SELECT * FROM record_archives ORDER BY at DESC,target').all()) {
      if(row.kind==='job') {
        const job=jobs.get(String(row.target))
        if(!job || !inScope(job.roleIds,rooms.has(job.topic)?job.topic:'',t,unlocked)) continue
        if(!t.roomId && job.roleIds.length===1 && archived.get('topic',t.roleId!,job.topic)) continue
        result.push(view({...t,kind:'job',id:job.id},[job],[],Number(row.at)))
      } else if(t.roleId && t.roleId===row.owner) {
        const topic=String(row.target)
        result.push(view({...t,kind:'topic',topic},topicJobs(t.roleId,topic),localLetters(t.roleId,topic),Number(row.at)))
      }
    }
    return {items:result}
  }
  function mutate(action:string,t:Target,unlocked:readonly string[]) {
    scope(t,unlocked)
    const isJob=t.kind==='job'
    const owner=isJob?'':t.roleId!, target=isJob?t.id!:t.topic!
    if(!target || (!isJob && (!t.roleId || rooms.has(target)))) throw denied()
    const batch=isJob?'job:'+target:'topic:'+key(owner,'erased',target)
    const job=isJob?jobs.get(target):undefined
    if(isJob && !job) {
      const old=db.prepare('SELECT room,roles FROM deleted_record_access WHERE id=?').get(target)
      if(action==='deleterecord' && old && inScope(JSON.parse(String(old.roles)),String(old.room),t,unlocked))
        return deletionReceipt(batch,target)
      throw denied()
    }
    if(job && (!inScope(job.roleIds,rooms.has(job.topic)?job.topic:'',t,unlocked) || (t.roomId && job.mode==='chat'))) throw denied()
    const selected=job?[job]:topicJobs(owner,target)
    const mail=isJob?[]:localLetters(owner,target)
    const archivedRow=archived.get(t.kind,owner,target)
    if(!isJob && !selected.length && !mail.length && !archivedRow) {
      if(action==='deleterecord' && removedTopic.get(owner,target)) return deletionReceipt(batch)
      throw denied()
    }
    if(action==='readrecord') {
      if(!archivedRow) throw denied()
      return {jobs:selected,letters:mail}
    }
    if(selected.some(active)) throw Error('记录仍在执行，请先停止或等待本轮结束。')
    if(action==='archiverecord') {archive.run(t.kind,owner,target,Date.now());return {ok:true}}
    if(action==='restorerecord') {
      if(job && job.roleIds.length===1 && archived.get('topic',job.roleIds[0]!,job.topic)) throw Error('请先恢复整段话题。')
      restore.run(t.kind,owner,target);return {ok:true}
    }
    if(action!=='deleterecord') throw denied()
    db.exec('BEGIN IMMEDIATE')
    try {
      for(const j of selected) eraseJob(j,batch)
      if(!isJob) {
        eraseLetters(owner,target,batch)
        db.prepare('INSERT OR IGNORE INTO deleted_local_topics VALUES(?,?)').run(owner,target)
      } else if(job && job.roleIds.length===1 && !rooms.has(job.topic)) {
        for(const id of job.roleIds) {
          const hasSibling=[...jobs.values()].some(j=>j.id!==job.id && j.topic===job.topic && j.roleIds.includes(id))
          if(!hasSibling) eraseLetters(id,job.topic,batch)
        }
      }
      restore.run(t.kind,owner,target)
      db.exec('COMMIT')
    } catch(error) {db.exec('ROLLBACK');throw error}
    for(const j of selected) jobs.delete(j.id)
    return deletionReceipt(batch)
  }
  function deleteLegacy(id:string,unlocked:readonly string[]) {
    const job=jobs.get(id)
    if(job?.mode==='chat')throw denied()
    if(!job) {
      const old=db.prepare('SELECT room,roles FROM deleted_record_access WHERE id=?').get(id)
      if(!old || !JSON.parse(String(old.roles)).every((r:string)=>unlocked.includes(r))) throw denied()
      if(old.room && !rooms.get(String(old.room))?.roleIds.every(r=>unlocked.includes(r)))throw denied()
      return {deleted:true,filesPending:!deleted.cleanup(id)}
    }
    const scope=rooms.has(job.topic)?{roomId:job.topic}:{roleId:job.roleIds[0]}
    const result=mutate('deleterecord',{kind:'job',id,...scope},unlocked)
    return {deleted:true,filesPending:'filesPending' in result && result.filesPending}
  }
  return {visibility,topicClosed,assertCanRun,list,mutate,deleteLegacy}
}
