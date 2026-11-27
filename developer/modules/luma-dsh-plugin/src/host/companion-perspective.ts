import type { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { memoryMatch } from './memory-match.ts'
import { statedStyles } from './contact-style.ts'

// Index only a role's own words from an identified private chat. Deliverables,
// quoted characters and one-off role play cannot establish a personal position.
const position = /^(?:(?:其实|现在|后来|不过|这次|原先|想了想|想过之后)[，, ]*)*我(?:自己|个人|现在|还是|倒是|其实|一直|后来|会|更)?(?:倾向|偏爱|喜欢|不喜欢|偏向|看重|在意|觉得|认为|更喜欢|更看重|改主意|改变.*看法|宁愿|不认同|赞同|不同意|选)|^I (?:now |still |personally )?(?:prefer|think|believe|disagree|changed my mind)\b/iu
const creativeRequest = /(?:扮演|假装|(?:写|拟|起草|生成|润色|改写).{0,16}(?:独白|故事|剧本|小说|台词|示例|例句|文案|短文|宣传语|邮件|回复模板|广告词)|代我(?:写|说)|模仿|翻译|照着念|按原样|复述|role[ -]?play|translate|repeat after me|write.{0,24}(?:story|script|dialogue|copy|speech))/iu
const sensitive = /(?:验证码|口令|密码|私钥|身份证|银行卡|password|secret|api[ _-]?key|access[ _-]?token|sk-[a-z\d]{10,})/iu

export function initializePerspectives(db: DatabaseSync) {
  const schema=db.prepare('PRAGMA table_info(notes)')
  if (schema.all().some(row=>row.name==='reflectionAt')) return
  db.exec('BEGIN IMMEDIATE')
  try {
    const columns=schema.all()
    if (columns.some(row=>row.name==='reflectionAt')) { db.exec('COMMIT');return }
    if (!columns.some(row=>row.name==='chatPosition')) {
      db.exec('ALTER TABLE notes ADD COLUMN chatPosition TEXT')
      // Old desk jobs retained their mode. Native turns are identified later
      // when their session replays a verified journal entry.
      const select=db.prepare('SELECT user,assistant FROM notes WHERE id=?')
      const update=db.prepare('UPDATE notes SET chatPosition=? WHERE id=?')
      const chats=db.prepare(`SELECT json_extract(value,'$.roleIds[0]') AS role,json_extract(value,'$.topic') AS topic,id
        FROM jobs WHERE json_extract(value,'$.mode')='chat' AND json_extract(value,'$.status')='done'
        AND json_array_length(value,'$.roleIds')=1 AND json_extract(value,'$.topic') NOT IN (SELECT id FROM rooms)`)
      for (const {role,topic,id} of chats.iterate()) {
        const key=createHash('sha256').update(JSON.stringify([role,topic,id])).digest('hex')
        const note=select.get(key)
        if (note) update.run(chatPosition(String(note.user),String(note.assistant)),key)
      }
    }
    db.exec(`ALTER TABLE notes ADD COLUMN reflection TEXT;
      ALTER TABLE notes ADD COLUMN reflectionEvidence TEXT;
      ALTER TABLE notes ADD COLUMN reflectionAt INTEGER;
      CREATE INDEX IF NOT EXISTS by_role_perspective ON notes(role,createdAt DESC) WHERE chatPosition!='' OR reflection IS NOT NULL;
      COMMIT;`)
  } catch(error) { db.exec('ROLLBACK');throw error }
}

export interface PrivateExcerpt { id:string; user:string; reply:string }
export function readReflection(value:string, source?:PrivateExcerpt) {
  if (!source || creativeRequest.test(source.user) || sensitive.test(source.user+' '+source.reply) || Object.keys(statedStyles(source.user)).length) return
  try {
    const data=JSON.parse(value.replace(/^`{3}(?:json)?\s*|\s*`{3}$/giu,''))
    if (data?.action!=='reflect' || data.source!==source.id || typeof data.evidence!=='string' || typeof data.thought!=='string') return
    const evidence=data.evidence.trim(), thought=data.thought.trim()
    if (evidence.length<4 || evidence.length>240 || (!source.user.includes(evidence) && !source.reply.includes(evidence))) return
    if (!thought || thought.length>360 || sensitive.test(thought) || /[\r\n`]/u.test(thought)) return
    return {source:source.id,evidence,thought}
  } catch { return }
}
export function chatPosition(user:string, reply:string) {
  if (!user || creativeRequest.test(user) || sensitive.test(user+' '+reply) || Object.keys(statedStyles(user)).length) return ''
  if (/[`「」“”"『』]|(?:^|\n)\s*>/u.test(reply)) return ''
  for (const part of reply.split(/(?<=[。！？!?])|\n+/u)) {
    const sentence=part.trim()
    if (sentence.length>=6 && sentence.length<=300 && position.test(sentence) && !/[?？]$/u.test(sentence) && !user.includes(sentence.replace(/[。.!！]$/u,''))) return sentence
  }
  return ''
}

export function recentPosition(db:DatabaseSync, role:string, query:string) {
  const match=memoryMatch(query.replace(/(?:你|我)?(?:自己|现在|还是|最近|之前|原来)?(?:觉得|认为|倾向|偏爱|喜欢|看法|观点|想法|主意|怎么看|怎么想|选哪个|想选|选择|为什么|不同意|更看重|还记得)/gu,' '))
  const overview=/^(?:你(?:自己|现在|最近|之前|当时|原来)?(?:有(?:哪些|什么)(?:想法|看法|偏好)|(?:怎么|是怎么)想的|改变主意了吗))[？?。\s]*$/u.test(query)
  for (const row of db.prepare(`SELECT id,chatPosition,createdAt,reflection,reflectionEvidence,reflectionAt,substr(user,1,320) AS subject FROM portrait_recallable_notes
    WHERE role=? AND (chatPosition!='' OR reflection IS NOT NULL) ORDER BY createdAt DESC,noteOrder DESC`).iterate(role)) {
    // Among statements on the subject, a later position supersedes an old one
    // even if the earlier statement happens to repeat more of the query terms.
    if (row.reflection && (overview || match.score(row.reflection+' '+row.reflectionEvidence+' '+row.subject)>=4))
      return {kind:'reflection',quote:String(row.reflection),evidence:String(row.reflectionEvidence),time:Number(row.reflectionAt),source:String(row.id)}
    if (row.chatPosition && (overview || match.score(row.chatPosition+' '+row.subject)>=4))
      return {kind:'spoken',quote:String(row.chatPosition),time:Number(row.createdAt),source:String(row.id)}
  }
}
