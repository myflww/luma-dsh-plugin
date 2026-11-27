import { asksOtherMembers, closesRoomDiscussion, mentionedRoomMembers } from '../shared/room-dialogue.ts'

export function precedingRoomSpeakers(jobs:{text:string;steps:{status:string;output:string;roleId:string}[]}[]) {
  const speakers:string[]=[]
  for (let i=jobs.length-1;i>=0;i--) {
    const job=jobs[i]!
    const published=job.steps.filter(s=>s.status==='done' && s.output)
    speakers.unshift(...published.map(s=>s.roleId))
    if (published.length && !asksOtherMembers(job.text)) break
  }
  return speakers
}

export function roomChatPlan(text:string, members:string[], names:Record<string,string[]>, configured:string[], preceding:string[]=[]) {
  const message=text.trim().normalize('NFKC').toLowerCase()
  const previous=preceding.at(-1)
  const available=configured.length ? configured : members
  if (closesRoomDiscussion(message)) return {ids:[previous && available.includes(previous) ? previous : available[0]!]}
  if (/@全员|@所有人/u.test(message)) return {ids:members,required:members.length}
  const mentioned=mentionedRoomMembers(message,members,names)
  if (mentioned.length) return {ids:mentioned}
  if (asksOtherMembers(message)) {
    const fresh=available.filter(id=>!preceding.includes(id))
    return fresh.length ? {ids:fresh} : {ids:available,required:0}
  }
  if (/每(?:个|一位|位)?(?:人|成员|同事|伙伴|角色).{0,12}(?:说|聊|讲|答|分享|观点|意见)|(?:大家|你们|各位).{0,16}(?:各自|分别|都说说|轮流|自己(?:说|选|告诉|觉得)|适合(?:做|什么)|怎么(?:看|想)|觉得|意见|想法|看法)|一人一(?:句|条)/u.test(message)) return {ids:available,required:available.length}
  if (previous && available.includes(previous) && /^(?:为什么|为啥|然后呢|怎么说|具体呢|继续|接着说|展开(?:说说|讲讲)|你(?:说的|刚才|觉得|呢))/u.test(message)) return {ids:[previous]}
  const next=(available.indexOf(previous ?? '')+1)%available.length
  return {ids:[...available.slice(next),...available.slice(0,next)],required:1}
}
