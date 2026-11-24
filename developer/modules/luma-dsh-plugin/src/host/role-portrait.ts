import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { statedStyles } from './contact-style.ts'
import type { TextMessage } from './employee-model.ts'
import type { PortraitItem, PortraitKind, PortraitSource } from '../shared/role-portrait.ts'
import type { memoryMatch } from './memory-match.ts'

const privateScope = 'private'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s，。！；,.!;]+/gu,'')
const secrets = /(?:api[ _-]?key|access[ _-]?token|password|secret|私钥|密码|验证码|身份证号|银行卡号|sk-[a-z\d]{10,}|https?:\/\/\S+[?&]\S+=)/iu
const temporary = /^(?:今天|这次|本次|这回|这单|临时|现在|这份|这个任务|以下|示例|假设|假如|比如|例如)|(?:举例|扮演|假装|示例|台词|假设|测试用例|替我写|这次先|仅限这次|只限今天)/u
const stable = /^(?:请(?:你)?记住[，,：:\s]*|记住[，,：:\s]*|(?:我|我们)(?:的(?:长期|常用|默认|工作|品牌|项目|偏好|习惯|写作|排版|署名|公司|家乡|昵称|名字|称呼|母语|职业|产品|配色|时区|格式|语言)|(?:最|更|一向|一直|通常|平时|一般|比较|不太)?(?:喜欢|偏好|习惯|常用|惯用|希望以后|希望今后|希望每次)|以后|长期|每次)|(?:以后|今后|从今往后|往后|每次|平时|默认|长期|一律)(?=.{3}))/u
const repeatable = /^(?:(?:请(?:你)?|麻烦(?:你)?|帮我|记得|务必|尽量)\s*)?(?:用.{1,28}(?:格式|输出|写|排版|绘制|标注|列出)|(?:先|只|统一|保持|按|按照|保留|使用|列出|标注|把).{4,95})$/u
export function isTemporaryMemory(text:string) { return temporary.test(text.trim()) }
// Treat a user's own enduring preference as a distinct source of evidence.
// An explicit project limits where it applies; an unscoped preference needs
// strong topical overlap. Never promote a team rule or a coworker's words.
function personalWorkPreference(text:string) {
  const personal=/^(?:请(?:你)?记住[，,：:\s]*)?我(?:的(?:个人|长期|默认|常用|固定)?(?:偏好|习惯)|(?:长期|一向|一直|通常|平时|比较|更)?(?:喜欢|偏好|习惯))/u.exec(text)
  if (!personal || temporary.test(text) || /本群|群稿|群内|群规|组内|成员统一|团队统一|同事们|大家都/u.test(text)) return
  const subject=text.slice(personal[0].length)
  const title=subject.match(/[《「“]([^《》「」“”\n]{1,80})[》」”](?:这个)?(?:项目|系列|工程|中|里|的)/u)?.[1]
  const scoped=subject.match(/(?:在|对于|针对|关于|为)\s*(?:项目\s*)?([^，。；：:「」“”《》\n]{1,80}?)(?:项目中?|项目里|系列中|工程中|中|里)/u)?.[1]?.trim()
  const project=title || scoped
  if (project && /^(?:这个|这份|该|本|每个|同一个|工作|项目|任务|日常|生活|工作室|文档|群聊)$/u.test(project)) return
  return {subject,project}
}
function supportedSummary(quote:string,summary:string) {
  // Let the model select meaningful spans. A claim that cannot be traced back to the
  // cited words is displayed using those words, with no inferred identity or trait.
  const thirdPerson=quote.replace(/^我(?=的|喜欢|偏好|习惯|通常|一般|长期|经常|常用)/u,'用户')
  return normalize(thirdPerson).includes(normalize(summary)) ? summary : quote
}
function candidates(text: string, manual: boolean) {
  if (!text || text.includes('\x60\x60\x60') || secrets.test(text) || /(?:角色扮演|请扮演|以下(?:是|仅为)(?:示例|范例|台词)|测试用例)/u.test(text)) return []
  const chunks = text.match(/[^。！？?；\r\n]+[！？?]?/gu) ?? []
  const found: {quote:string; kind:'stated'|'repeated'}[] = []
  for (const raw of chunks.slice(0,30)) {
    const line=raw.trim()
    const checkQuotes=line.replace(/(?:在|对于|针对|关于|为)(?:项目)?[《「“][^《》「」“”\n]{1,80}[》」”](?=(?:这个)?(?:项目|系列|工程|中|里|的))/gu,'项目')
    if (line.length < 4 || line.length > 260 || /[?？「」“”《》]|(?:吗|么|呢)[！!]?$/.test(checkQuotes) || temporary.test(line) || Object.keys(statedStyles(line)).length) continue
    if (manual || stable.test(line)) found.push({quote:line,kind:'stated'})
    else if (repeatable.test(line)) found.push({quote:line,kind:'repeated'})
    if (found.length===5) break
  }
  return found
}
function subjectOf(quote:string) {
  // Only overwrite a declared single-valued attribute. Independent likes may coexist.
  const m = quote.match(/^(?:请(?:你)?记住[，,：:\s]*)?(?:我(?:们)?的)(品牌名(?:称)?|默认(?:语言|格式|字体|配色)|署名|时区|母语|昵称|职业|名字)(?:现在|以后|已经)?(?:改为|改成|换成|是|为|叫|用)(.+)$/u)
  return m ? 'field:'+m[1] : 'quote:'+normalize(quote)
}
type Model = (role:string, messages:TextMessage[], signal:AbortSignal)=>Promise<string|undefined>
export function createRolePortraits(db:DatabaseSync, model:Model) {
  db.exec(`CREATE TABLE IF NOT EXISTS portrait_items(
    id TEXT PRIMARY KEY, role TEXT NOT NULL, scope TEXT NOT NULL, text TEXT NOT NULL, evidence TEXT NOT NULL,
    kind TEXT NOT NULL, source TEXT NOT NULL, count INTEGER NOT NULL, updatedAt INTEGER NOT NULL, revision INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS portrait_role ON portrait_items(role,scope,updatedAt);
    CREATE TABLE IF NOT EXISTS portrait_evidence(item TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(item,event));
    CREATE TABLE IF NOT EXISTS portrait_turns(seq INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, event TEXT NOT NULL UNIQUE);
    CREATE INDEX IF NOT EXISTS portrait_turn_sequence ON portrait_turns(role,seq);
    CREATE TABLE IF NOT EXISTS portrait_hidden_sources(role TEXT NOT NULL, scope TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(role,scope,event));
    CREATE TABLE IF NOT EXISTS portrait_house_uploads(role TEXT NOT NULL,event TEXT NOT NULL,PRIMARY KEY(role,event));
    CREATE VIEW IF NOT EXISTS portrait_recallable_notes AS SELECT n.* FROM employee_private_notes n
      WHERE NOT EXISTS (SELECT 1 FROM portrait_hidden_sources s WHERE s.role=n.role AND s.scope='private' AND s.event=n.id);
    CREATE TABLE IF NOT EXISTS portrait_preferences(role TEXT PRIMARY KEY, automatic INTEGER NOT NULL DEFAULT 1,
      modelReview INTEGER NOT NULL DEFAULT 0, cursor INTEGER NOT NULL DEFAULT 0);`)
  const active = new Map<string,AbortController>()
  const pending = new Set<string>()
  const notices = new Map<string,string>()
  let disposed=false
  function prefs(role:string) {
    return db.prepare('SELECT * FROM portrait_preferences WHERE role=?').get(role) ?? {automatic:1, modelReview:0, cursor:0}
  }
  function omitUploadedSource(role:string,event:string) {
    if (db.prepare('SELECT 1 FROM portrait_house_uploads WHERE role=? AND event=? UNION ALL SELECT 1 FROM notes WHERE role=? AND id=? AND synced=1 LIMIT 1')
      .get(role,event,role,event)) {
      db.prepare("INSERT OR IGNORE INTO integration VALUES(?,'1')").run('portrait.local-recall.'+role)
    }
  }
  function canRecallRemote(role:string) {
    return !db.prepare('SELECT id FROM integration WHERE id=?').get('portrait.local-recall.'+role)
  }
  function allowSource(role:string,scope:string,event:string) {
    return !db.prepare('SELECT 1 FROM portrait_hidden_sources WHERE role=? AND scope=? AND event=?').get(role,scope,event)
  }
  function hideSource(role:string,scope:string,event:string) {
    db.prepare('INSERT OR IGNORE INTO portrait_hidden_sources VALUES(?,?,?)').run(role,scope,event)
    if (scope===privateScope) omitUploadedSource(role,event)
  }
  function keepProjectReplyInTranscript(role:string,event:string) {
    // The answer can paraphrase a project-only fact. Keep the conversation
    // visible to the person, while future prompts retrieve the original item
    // under its current project, correction and visibility rules.
    if (!db.prepare('SELECT 1 FROM notes WHERE role=? AND id=?').get(role,event)) hideSource(role,privateScope,event)
  }
  function hideEvidence(role:string,scope:string,item:string,except?:string) {
    for (const row of db.prepare('SELECT event FROM portrait_evidence WHERE item=?').all(item)) {
      if (row.event!==except) hideSource(role,scope,String(row.event))
    }
  }
  function hideQuotedReplies(role:string,scope:string,previous:string) {
    // A later assistant answer can repeat a value even when the originating job is gone.
    // Match literal, distinctive excerpts in that scope, without retaining erased text.
    const fieldValue=subjectOf(previous).startsWith('field:') ? previous.replace(/^.*?(?:改为|改成|换成|是|为|叫|用)/u,'') : ''
    const assignedValue=previous.match(/(?:写为|写作|标为|标作|填写为|设置为|命名为|改成|改为|换成|定为)([^，。；！？\n]{4,100})$/u)?.[1]?.trim()
    const terms=new Set([previous,fieldValue,assignedValue ?? ''].filter(term=>term.length>=4))
    for (const term of terms) {
      const matching=scope===privateScope
        ? db.prepare('SELECT id FROM employee_private_notes WHERE role=? AND instr(assistant,?)>0').all(role,term)
        : db.prepare(`SELECT j.id FROM jobs j WHERE json_extract(j.value,'$.topic')=? AND EXISTS
          (SELECT 1 FROM json_each(j.value,'$.steps') s WHERE instr(json_extract(s.value,'$.output'),?)>0)`).all(scope,term)
      for (const entry of matching) hideSource(role,scope,String(entry.id))
    }
  }
  function beginHouseUpload(role:string,event:string) {
    // A prior batch can be stale after an await. Record intent immediately before the actual sync call.
    if (!db.prepare('SELECT 1 FROM portrait_recallable_notes WHERE role=? AND id=? AND synced=0').get(role,event)) return false
    db.prepare('INSERT OR IGNORE INTO portrait_house_uploads VALUES(?,?)').run(role,event)
    return true
  }
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='portrait_cutoffs'").get()
    && !db.prepare("SELECT 1 FROM integration WHERE id='portrait.evidence-scope.v2'").get()) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const house=db.prepare("SELECT value FROM integration WHERE id='house'").get()
      const bound:Record<string,unknown>=house ? JSON.parse(String(house.value)).libraries ?? {} : {}
      for (const flag of db.prepare("SELECT id FROM integration WHERE id LIKE 'portrait.local-recall.%'").all()) {
        if (!bound[String(flag.id).slice('portrait.local-recall.'.length)]) db.prepare('DELETE FROM integration WHERE id=?').run(String(flag.id))
      }
      for (const row of db.prepare(`SELECT p.role,p.scope,p.kind,p.evidence,e.event,n.user,j.value FROM portrait_items p
        JOIN portrait_cutoffs c ON c.role=p.role AND c.scope=p.scope JOIN portrait_evidence e ON e.item=p.id
        LEFT JOIN notes n ON p.scope='private' AND n.id=e.event LEFT JOIN jobs j ON p.scope!='private' AND j.id=e.event`).all()) {
        const quote=String(row.evidence), original=row.user ?? (row.value ? JSON.parse(String(row.value)).text : '')
        if (row.kind==='corrected' || (quote && subjectOf(quote).startsWith('field:') && !String(original).includes(quote))) {
          hideSource(String(row.role),String(row.scope),String(row.event))
        }
      }
      db.prepare("INSERT INTO integration VALUES('portrait.evidence-scope.v2','1')").run()
      db.exec('COMMIT')
    } catch(e) {db.exec('ROLLBACK');throw e}
  }
  function store(role:string,scope:string,event:string,quote:string,summary:string,kind:PortraitKind,source:PortraitSource,at:number) {
    const id=hash(JSON.stringify([role,scope,subjectOf(quote)]))
    const row=db.prepare('SELECT text,kind FROM portrait_items WHERE id=?').get(id)
    if (!row) db.prepare('INSERT INTO portrait_items VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,role,scope,summary,quote,kind,source,0,at,0)
    if (!db.prepare('INSERT OR IGNORE INTO portrait_evidence VALUES(?,?)').run(id,event).changes) return
    if (row && (!row.text || row.kind==='corrected') && source!=='manual') {
      const explicitRevision=row.text && subjectOf(quote).startsWith('field:') && /改为|改成|换成/u.test(quote)
      if (!explicitRevision) {hideSource(role,scope,event);return}
    }
    if (row && row.text!==summary && subjectOf(quote).startsWith('field:')) hideEvidence(role,scope,id,event)
    db.prepare(`UPDATE portrait_items SET text=?, evidence=?, source=?, kind=CASE WHEN kind='stated' THEN kind ELSE ? END,
      count=count+1,updatedAt=?,revision=revision+1 WHERE id=?`).run(summary,quote,source,kind,at,id)
  }
  function observe(role:string,scope:string,event:string,text:string,source:PortraitSource,at=Date.now()) {
    if (!text || !Number(prefs(role).automatic)) return
    for (const {quote,kind} of candidates(text,source==='manual')) store(role,scope,event,quote,quote,kind,source,at)
    if (scope===privateScope && source!=='manual') {
      db.prepare('INSERT OR IGNORE INTO portrait_turns(role,event) VALUES(?,?)').run(role,event)
      if (Number(prefs(role).modelReview)) schedule(role)
    }
  }
  // One ordered pass upgrades existing private records. Group and proactive output are never input.
  if (!db.prepare("SELECT id FROM integration WHERE id='portrait.v1'").get()) {
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of db.prepare("SELECT id,role,user,topic,createdAt FROM employee_private_notes WHERE user!='' AND topic!='outreach' ORDER BY noteOrder").iterate()) {
        observe(String(row.role),privateScope,String(row.id),String(row.user),row.topic==='notes'?'manual':'history',Number(row.createdAt))
      }
      db.prepare("INSERT OR IGNORE INTO integration VALUES('portrait.v1','1')").run()
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK');throw e }
  }
  const visible = "text!='' AND (kind!='repeated' OR count>=3)"
  function list(role:string) {
    return db.prepare('SELECT id,scope,text,evidence,kind,source,count,updatedAt,revision FROM portrait_items WHERE role=? AND '+visible+' ORDER BY updatedAt DESC,id')
      .all(role) as unknown as PortraitItem[]
  }
  function context(role:string,scope:string,match?:ReturnType<typeof memoryMatch>,includeOwnGroupWork=false) {
    const selection='SELECT text,kind,source,count FROM portrait_items WHERE role=? AND scope=? AND '+visible+
      " ORDER BY (kind='corrected') DESC, updatedAt DESC,id"
    if (!match || match.browse) return db.prepare(selection+' LIMIT 16').all(role,scope)
    const local=db.prepare(selection).all(role,scope)
    if (includeOwnGroupWork && scope===privateScope) {
      // For legacy items the evidence event is the original job ID. A tombstone
      // can attest to room work because room chat turns cannot be deleted. No room transcript
      // or second copy of the preference is read into the model context.
      const group=db.prepare("SELECT p.scope,p.text,p.kind,p.source,p.count FROM portrait_items p WHERE p.role=? AND p.scope!='private' AND "+visible+
        " AND EXISTS(SELECT 1 FROM portrait_evidence e LEFT JOIN jobs j ON j.id=e.event LEFT JOIN deleted_jobs d ON d.id=e.event WHERE e.item=p.id"+
        " AND (d.id IS NOT NULL OR (json_extract(j.value,'$.mode') IN ('team','task') AND json_extract(j.value,'$.topic')=p.scope"+
        " AND EXISTS(SELECT 1 FROM json_each(j.value,'$.steps') s WHERE json_extract(s.value,'$.roleId')=p.role AND json_extract(s.value,'$.status')='done'))))"+
        " ORDER BY (kind='corrected') DESC, updatedAt DESC,p.id").all(role)
        .filter(item=>{
          const preference=personalWorkPreference(String(item.text))
          if (!preference) return false
          return preference.project ? match.mentions(preference.project) && match.score(preference.subject.replace(preference.project,''))>0
            : match.sharesTopic(preference.subject)
        })
      if (new Set(group.map(item=>item.scope)).size===1) {
        for (const {scope:_, ...item} of group) local.push({...item, participation:'own-project-work'})
      }
    }
    return local.map(item=>({item,score:match.score(String(item.text))})).filter(entry=>entry.score>0)
      .sort((a,b)=>b.score-a.score).slice(0,16).map(entry=>entry.item)
  }
  function review(role:string,id:string,revision:number,value:string) {
    const row=db.prepare('SELECT scope,text,evidence FROM portrait_items WHERE role=? AND id=? AND revision=? AND '+visible).get(role,id,revision)
    if (!row) throw Error('这条画像已有变化，请重新读取后再操作。')
    active.get(role)?.abort()
    db.exec('BEGIN IMMEDIATE')
    try {
      const change=db.prepare("UPDATE portrait_items SET text=?,evidence='',kind='corrected',source='manual',revision=revision+1,updatedAt=? WHERE role=? AND id=? AND revision=?")
        .run(value,Date.now(),role,id,revision)
      if (!change.changes) throw Error('这条画像已有变化，请重新读取后再操作。')
      hideEvidence(role,String(row.scope),id)
      hideQuotedReplies(role,String(row.scope),String(row.evidence || row.text))
      if (row.scope!==privateScope && personalWorkPreference(String(row.text))) hideQuotedReplies(role,privateScope,String(row.text))
      db.exec('COMMIT')
    } catch(e) {db.exec('ROLLBACK');throw e}
  }
  function configure(role:string,automatic:boolean,modelReview:boolean) {
    active.get(role)?.abort()
    const current=prefs(role)
    const cursor=modelReview===Boolean(current.modelReview) && automatic===Boolean(current.automatic) ? Number(current.cursor)
      : Number(db.prepare('SELECT max(seq) AS n FROM portrait_turns WHERE role=?').get(role)?.n ?? 0)
    db.prepare('INSERT OR REPLACE INTO portrait_preferences VALUES(?,?,?,?)').run(role,Number(automatic),Number(modelReview && automatic),cursor)
  }
  function schedule(role:string) {
    if (disposed) return
    if (active.has(role)) {pending.add(role);return}
    const controller=new AbortController()
    active.set(role,controller)
    // The caller may still be in its completion transaction. Read committed turns after it returns.
    void Promise.resolve().then(async ()=>{
      while (!disposed && !controller.signal.aborted) {
        const p=prefs(role)
        if (!Number(p.modelReview) || !Number(p.automatic)) break
        const turns=db.prepare(`SELECT n.id,t.seq,n.user FROM portrait_turns t JOIN portrait_recallable_notes n ON n.id=t.event AND n.role=t.role
          WHERE t.role=? AND t.seq>? ORDER BY t.seq LIMIT 4`).all(role,Number(p.cursor))
        if (turns.length!==4) break
        const inputs=turns.filter(t=>!secrets.test(String(t.user))).map(t=>({id:t.id,text:String(t.user).slice(0,1500)}))
        const output=inputs.length ? await model(role,[
          {role:'system',content:'从用户自己的话里整理对未来有用的长期偏好或明确背景。不要推断身份、健康、财务或敏感属性，忽略角色扮演、引用和一次性要求。只返回 JSON 数组，最多三项，每项包含 id（摘录编号）、quote（用户原文的连续片段）、summary（忠实、简短的中文陈述）。没有可靠依据时返回 []。'},
          {role:'user',content:JSON.stringify(inputs)}
        ],AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])) : '[]'
        if (disposed || controller.signal.aborted) break
        if (!output) throw Error('unavailable')
        const result:unknown=JSON.parse(output.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,''))
        if (!Array.isArray(result)) throw Error('invalid')
        db.exec('BEGIN IMMEDIATE')
        try {
          for (const item of result.slice(0,3)) {
            const source=inputs.find(input=>input.id===item?.id)
            if (!source || !db.prepare('SELECT id FROM portrait_recallable_notes WHERE id=? AND role=?').get(String(source.id),role)
              || typeof item.quote!=='string' || typeof item.summary!=='string') continue
            const quote=item.quote.trim(), summary=item.summary.trim()
            if (quote.length<4 || quote.length>260 || !summary || summary.length>240 || !source.text.includes(quote) || secrets.test(quote+summary) || temporary.test(quote) || Object.keys(statedStyles(quote)).length) continue
            store(role,privateScope,String(source.id),quote,supportedSummary(quote,summary),'model','history',Date.now())
          }
          db.prepare('UPDATE portrait_preferences SET cursor=? WHERE role=?').run(Number(turns[3]!.seq),role)
          db.exec('COMMIT')
          notices.delete(role)
        } catch(e) {db.exec('ROLLBACK');throw e}
      }
    }).catch(()=>{
      if (!disposed && !controller.signal.aborted) notices.set(role,'上次模型整理未完成，下一轮新消息后重试。')
    }).finally(()=>{
      active.delete(role)
      if (pending.delete(role) && !disposed) schedule(role)
    })
  }
  function dispose(){disposed=true;for (const c of active.values()) c.abort()}
  return {list,context,prefs,configure,observe,review,canRecallRemote,omitUploadedSource,allowSource,beginHouseUpload,keepProjectReplyInTranscript,dispose,notice:(role:string)=>notices.get(role)}
}
