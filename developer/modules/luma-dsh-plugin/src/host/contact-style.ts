import type { DatabaseSync } from 'node:sqlite'
const labels = {address:'称呼',order:'回答顺序',emoji:'表情习惯',length:'回复详略'} as const
type Field = keyof typeof labels
export interface StyleItem { key: Field; label: string; value: string }
const lead = /^(?:(?:以后|往后|今后|下次|平时|之后|还是|改成|我希望你|我更喜欢你|跟我聊天时|和我说话时|回复我时|你可以|麻烦你|请你|请|你)\s*)+/u
const alias = /^[「“"']?([\p{L}\p{N}· ]{1,16}?)[」”"']?(?:吧|好了|就好|就行|了)?$/u

/** Only direct, short first-person requests become lasting preferences. */
export function statedStyles(text:string): Partial<Record<Field,string>> {
  const changes:Partial<Record<Field,string>>={}
  if(text.length>260 || /[`《》]/u.test(text)) return changes
  for(const raw of text.split(/[，,。.!！；;\n]+/u)) {
    const clause=raw.trim().replace(lead,'').trim()
    if(!clause || /[?？:：]/u.test(clause))continue
    const reset=clause.match(/^(?:忘掉|忘记|撤回|取消|清除)(?:我(?:之前|的))?(称呼|回答顺序|表情习惯|回复详略)(?:偏好|设置|要求)?$/u)
    if(reset) {
      const f=Object.keys(labels).find(k=>labels[k as Field]===reset[1]) as Field
      changes[f]=''
      continue
    }
    const address=clause.match(/^(不要再叫我|别再叫我|别叫我|不要叫我|不用叫我|换个称呼叫我|改叫我|叫我|称呼我为)(.+)$/u)
    if(address) {
      const named=address[2].trim().match(alias)
      if(named)changes.address=(/^(别|不要|不用)/u.test(address[1])?'避免称呼我为「':'称呼我为「')+named[1].trim()+'」'
    }
    if(/^(?:回答(?:时)?|回复(?:时)?)?(?:先给|先说|先讲|先写)(?:我)?(?:答案|结论|重点)(?:再.{1,12})?(?:吧|就好|就行)?$/u.test(clause)) changes.order='先给结论，再按需补充依据'
    if(/^(?:先讲|先说|先给)(?:我)?(?:理由|思路|过程|依据)(?:再.{1,12})?(?:吧|就好|就行)?$/u.test(clause)) changes.order='先说思路，再给结论'
    if(/^(?:少用|少发|少放|尽量少用)(?:点)?(?:表情包?|emoji)(?:吧|就好|就行)?$/iu.test(clause)) changes.emoji='少用表情'
    if(/^(?:别用|不用|不要用|别发|不要发)(?:表情包?|emoji)(?:吧|了)?$/iu.test(clause)) changes.emoji='不使用表情'
    if(/^(?:多用|多发|可以多用|可以多发)(?:点)?(?:表情包?|emoji)(?:吧|就好|就行)?$/iu.test(clause)) changes.emoji='可以多用表情'
    if(/^(?:回答|回复|说话)?(?:简短些|短一点|简洁一点|简短一点|精简点)(?:吧|就好)?$/u.test(clause)) changes.length='回复简短'
    if(/^(?:回答|回复|讲|说)?(?:详细一点|详细些|展开一点|多讲一点)(?:吧|就好)?$/u.test(clause)) changes.length='解释详细一些'
  }
  return changes
}
export function createContactStyles(db:DatabaseSync){
  db.exec("CREATE TABLE IF NOT EXISTS companion_styles(role TEXT NOT NULL,field TEXT NOT NULL,value TEXT NOT NULL, PRIMARY KEY(role,field))")
  const save=db.prepare("INSERT INTO companion_styles(role,field,value) VALUES(?,?,?) ON CONFLICT(role,field) DO UPDATE SET value=excluded.value")
  const rows=(role:string)=>db.prepare('SELECT field,value FROM companion_styles WHERE role=? ORDER BY field').all(role)
  function learn(role:string,text:string){for(const [key,value] of Object.entries(statedStyles(text)))save.run(role,key,value!)}
  function list(role:string):StyleItem[]{return rows(role).filter(r=>r.value).map(r=>({key:r.field as Field,label:labels[r.field as Field],value:String(r.value)}))}
  function forget(role:string,key:unknown,expected:unknown) {
    if(typeof key!=='string' || !Object.hasOwn(labels,key))throw Error('未知相处习惯。')
    const state=db.prepare('SELECT value FROM companion_styles WHERE role=? AND field=?').get(role,key)
    if(state?.value && state.value!==expected)throw Error('这条习惯刚有变化，请重新打开记忆面板再核对。')
    save.run(role,key,'')
    return list(role)
  }
  function context(role:string) {
    const saved=rows(role)
    return {current:saved.filter(r=>r.value).map(r=>r.value),withdrawn:saved.filter(r=>!r.value).map(r=>labels[r.field as Field])}
  }
  return {learn,list,forget,context}
}
