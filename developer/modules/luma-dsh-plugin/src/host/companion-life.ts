import type { DatabaseSync } from 'node:sqlite'
import { statedStyles } from './contact-style.ts'
import { createAppUsage } from './foreground-apps.ts'
import { companionVoices, defaultCompanionSettings, feeling, turnTone, followupLines, type CompanionSettings, type LifeLetter } from '../shared/companion-life.ts'

type Options = {
  unlocked: () => readonly string[]
  busy: (role: string) => boolean
  makeReply: (role: string, brief: string, signal: AbortSignal) => Promise<string | undefined>
  topic: (role: string, nativeTopic?: string) => string
  record: (letter: LifeLetter) => void
  speechStyle?: (role:string)=>{current:unknown[];withdrawn:unknown[]}
  portrait?: (role:string)=>unknown
  allowNote?: (role:string,id:string)=>boolean
  allowLetter?: (role:string,id:string)=>boolean
  now?: () => number
  usage?: ReturnType<typeof createAppUsage>
}
type Candidate = {role: string; place: 'office'|'home'; topic?: string; persona?: string}
const minute=60_000
function allowsOutreach(date: Date) {
  const localMinute = date.getHours() * 60 + date.getMinutes()
  return localMinute >= 8 * 60 + 30 && localMinute < 20 * 60
}
const validTopic = (s:unknown) => typeof s === 'string' && /^[a-zA-Z0-9_.:-]{1,180}$/.test(s)
export function createCompanionLife(db: DatabaseSync, opts:Options) {
  const now=opts.now ?? Date.now
  const apps=opts.usage ?? createAppUsage(now)
  const pending=new Set<AbortController>()
  let disposed=false
  let modelNotice=''
  db.exec(`CREATE TABLE IF NOT EXISTS companion_letters(id INTEGER PRIMARY KEY, role TEXT NOT NULL, topic TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', time INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'local');
    CREATE INDEX IF NOT EXISTS companion_letter_by_role ON companion_letters(role,time);
    CREATE TABLE IF NOT EXISTS companion_letter_counter(id INTEGER PRIMARY KEY CHECK(id=1),lastId INTEGER NOT NULL);
    INSERT OR IGNORE INTO companion_letter_counter SELECT 1,COALESCE(MAX(id),0) FROM companion_letters;
    CREATE TABLE IF NOT EXISTS companion_daylight(id INTEGER PRIMARY KEY CHECK (id=1), firstSeen INTEGER NOT NULL);`)
  function preferences():CompanionSettings {
    const row=db.prepare("SELECT value FROM integration WHERE id='companion.preferences'").get()
    return row ? {...defaultCompanionSettings,...JSON.parse(String(row.value))} : {...defaultCompanionSettings,sharedRoles:[]}
  }
  function status() {
    const settings=preferences()
    return {settings, roles:opts.unlocked(), apps:settings.collectApps ? apps.summary() : [], sampler:settings.collectApps ? apps.status() : 'off',modelNotice:settings.model ? modelNotice : ''}
  }
  function configure(patch: Record<string, unknown>) {
    const p=preferences()
    for(const key of ['proactive','danmaku','model','collectApps'] as const) {
      if (patch[key] !== undefined) {
        if(typeof patch[key] !== 'boolean') throw Error('陪伴选项无效。')
        p[key]=patch[key] as boolean
      }
    }
    if (patch.sharedRoles !== undefined) {
      if(!Array.isArray(patch.sharedRoles) || patch.sharedRoles.some(role=>typeof role!=='string' || !opts.unlocked().includes(role))) throw Error('只能与已入职伙伴共享。')
      p.sharedRoles=[...new Set(patch.sharedRoles as string[])]
    }
    if(!p.collectApps) p.sharedRoles=[]
    db.prepare("INSERT OR REPLACE INTO integration VALUES('companion.preferences',?)").run(JSON.stringify(p))
    for(const c of pending)c.abort()
    if(p.collectApps) apps.pulse()
    else apps.stop()
    return status()
  }
  function relationship(role:string) {
    const turns=db.prepare("SELECT user, createdAt FROM employee_private_notes WHERE role=? AND user!='' AND topic!='notes' ORDER BY createdAt DESC,noteOrder DESC LIMIT 12").all(role)
    const cue=turns.find(t=>turnTone(String(t.user))!==0)
    return { mood:feeling(cue ? {tone:turnTone(String(cue.user)),at:Number(cue.createdAt)} : undefined,now()),
      familiarity:turns.length>=6 ? '已相处多次，可以接续熟悉的话题' : turns.length ? '正在逐渐熟悉' : '初次相识，先给对方空间' }
  }
  function privateContext(role:string, allowApps:boolean, includeStyle=true) {
    const settings=preferences()
    const usage=allowApps && settings.collectApps && settings.sharedRoles.includes(role) ? apps.summary() : []
    const previousLetters:string[]=[]
    for (const row of db.prepare("SELECT id,text FROM companion_letters WHERE role=? AND text!='' ORDER BY time DESC").iterate(role)) {
      if (!opts.allowLetter || opts.allowLetter(role,String(row.id))) previousLetters.push(String(row.text))
      if (previousLetters.length===2) break
    }
    return {expression:relationship(role), ...(includeStyle && opts.speechStyle ? {conversationPreferences:opts.speechStyle(role)} : {}), previousLetters, ...(usage.length ? {recentForegroundApps:usage,usageWindowMinutes:15} : {}) }
  }
  function history():LifeLetter[] {
    const roles = new Set(opts.unlocked())
    return db.prepare("SELECT CAST(id AS TEXT) AS id,role,topic,text,time,source FROM companion_letters WHERE text!='' ORDER BY time DESC").all()
      .filter(row=>roles.has(String(row.role))).reverse() as unknown as LifeLetter[]
  }
  function claim(candidates: Candidate[], at:number) {
    const day=new Date(at)
    if(!allowsOutreach(day)) return
    day.setHours(0,0,0,0)
    db.exec('BEGIN IMMEDIATE')
    let rolledBack=false
    try {
      const first = db.prepare('SELECT firstSeen FROM companion_daylight WHERE id=1').get()
      if(!first) db.prepare('INSERT INTO companion_daylight VALUES(1,?)').run(at)
      if(!first || at-Number(first.firstSeen)<2*minute) return
      const recent=db.prepare('SELECT MAX(time) AS last, COUNT(CASE WHEN time>=? THEN 1 END) AS today FROM companion_letters').get(day.getTime())!
      if(Number(recent.today)>=3 || recent.last!=null && at-Number(recent.last)<90*minute) return
      if(hasRecentChat(at)) return
      const latest=db.prepare('SELECT role, MAX(time) AS last FROM companion_letters GROUP BY role').all()
      const stamp=(role:string)=>Number(latest.find(row=>row.role===role)?.last ?? 0)
      for(const c of [...candidates].sort((a,b)=>stamp(a.role)-stamp(b.role))) {
        if(opts.busy(c.role))continue
        const latestTurn=db.prepare("SELECT user, createdAt FROM employee_private_notes WHERE role=? AND user!='' AND topic!='notes' ORDER BY createdAt DESC,noteOrder DESC LIMIT 1").get(c.role)
        if(latestTurn && at-Number(latestTurn.createdAt)<24*60*minute && /先别找我|别打扰我|想一个人待|让我静静|暂时不要找我/.test(String(latestTurn.user))) continue
        const mood=relationship(c.role).mood
        const cue=mood==='轻快' ? followupLines[c.role][0] : mood==='沉静' ? followupLines[c.role][1] : undefined
        const choices=companionVoices[c.role][c.place]
        const seen=db.prepare("SELECT text FROM companion_letters WHERE role=? AND time>? AND text!=''").all(c.role,at-3*86400000)
        const available=cue && !seen.some(row=>row.text===cue) ? [cue] : choices.filter(text=>!seen.some(row=>row.text===text))
        if(!available.length) continue
        const text=available[Math.floor(at/86400000)%available.length]
        const topic=opts.topic(c.role,c.topic)
        const sequence=db.prepare('UPDATE companion_letter_counter SET lastId=MAX(lastId,(SELECT COALESCE(MAX(id),0) FROM companion_letters))+1 WHERE id=1 RETURNING lastId').get()!
        db.prepare('INSERT INTO companion_letters(id,role,topic,time) VALUES(?,?,?,?)').run(sequence.lastId,c.role,topic,at)
        return {c,letter:{id:String(sequence.lastId),role:c.role,topic,text,time:at,source:'local'} as LifeLetter}
      }
    } catch(error){db.exec('ROLLBACK');rolledBack=true;throw error}
    finally {if(!rolledBack)db.exec('COMMIT')}
  }
  function hasRecentChat(at: number) {
    return Boolean(db.prepare("SELECT 1 FROM employee_private_notes WHERE user!='' AND topic!='notes' AND createdAt>? LIMIT 1").get(at-20*minute))
  }
  async function pulse(body:Record<string,unknown>) {
    const p=preferences()
    if(p.collectApps) apps.pulse()
    if(!p.proactive || !Array.isArray(body.candidates))return {danmaku:p.danmaku}
    const allowed=opts.unlocked()
    const candidates:Candidate[]=[]
    for(const c of body.candidates.slice(0,8)) {
      if(!c || typeof c !== 'object' || !allowed.includes(c.role) || !Object.hasOwn(companionVoices,c.role) || !['home','office'].includes(c.place))continue
      candidates.push({role:c.role,place:c.place,topic:validTopic(c.topic) ? c.topic : undefined,
        persona:typeof c.persona==='string' ? c.persona.slice(0,2200) : undefined})
    }
    if(!candidates.length) return {danmaku:p.danmaku}
    const reservation=claim(candidates,now())
    if(!reservation) return {danmaku:p.danmaku}
    const {letter,c}=reservation
    const controller=new AbortController()
    pending.add(controller)
    try {
      if(p.model) {
        const context=privateContext(c.role,false)
        const memo=db.prepare("SELECT * FROM employee_private_notes WHERE role=? AND topic!='notes' AND user!='' ORDER BY createdAt DESC,noteOrder DESC LIMIT 100").all(c.role)
          .filter(r=> (!opts.allowNote || opts.allowNote(c.role,String(r.id))) && !Object.keys(statedStyles(String(r.user))).length).slice(0,2)
          .map(r=>({user:String(r.user).slice(0,450),reply:String(r.assistant).slice(0,450)}))
        const brief=JSON.stringify({place:c.place==='home'?'自己的卧室':'办公室',voice:companionVoices[c.role].voice,persona:c.persona,
          topicIdea:letter.text,context,userPortrait:opts.portrait?.(c.role),recentPrivateConversation:memo})
        let answer:string|undefined
        try {
          answer=await opts.makeReply(c.role,brief,controller.signal)
          if(!disposed)modelNotice=''
        } catch {
          if(!disposed && !controller.signal.aborted) modelNotice='上一次独立模型未能生成来信，伙伴会等到下一次合适的时机。'
          return {danmaku:p.danmaku}
        }
        if(answer!==undefined) {
          const text=answer.trim()
          if(!text || text==='[安静]' || text.length>220) return {danmaku:p.danmaku}
          letter.text=text;letter.source='model'
        }
      }
      if(disposed || controller.signal.aborted || !preferences().proactive || !opts.unlocked().includes(c.role) || opts.busy(c.role)) return {danmaku:false}
      if(p.model) {
        const delivered = new Date(now())
        if(!allowsOutreach(delivered) || delivered.toDateString() !== new Date(letter.time).toDateString() || hasRecentChat(delivered.getTime())) return {danmaku:false}
      }
      db.exec('BEGIN IMMEDIATE')
      try {
        const saved=db.prepare("UPDATE companion_letters SET text=?,source=? WHERE id=? AND role=? AND time=? AND text='' AND (topic=? OR (?='native-inbox' AND topic LIKE 'native:%')) RETURNING topic")
          .get(letter.text,letter.source,Number(letter.id),letter.role,letter.time,letter.topic,letter.topic)
        if(!saved) {db.exec('COMMIT');return {danmaku:false}}
        letter.topic=String(saved.topic)
        opts.record(letter)
        db.exec('COMMIT')
      } catch(error){db.exec('ROLLBACK');throw error}
      return {letter,danmaku:preferences().danmaku}
    } finally {pending.delete(controller)}
  }
  function dispose(){disposed=true;for(const c of pending)c.abort();apps.stop()}
  return {pulse, history, configure, status, privateContext,dispose}
}
