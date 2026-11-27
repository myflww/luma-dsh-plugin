export function mentionedRoomMembers(text:string,members:string[],names:Record<string,string[]>) {
  const message=text.trim().normalize('NFKC').toLowerCase()
  const aliases=members.flatMap(id=>(names[id] ?? []).map(alias=>({id,name:alias.trim().normalize('NFKC').toLowerCase()})))
    .filter(alias=>alias.name).sort((a,b)=>b.name.length-a.name.length)
  const mentioned=new Set<string>()
  // Match literal names in message order. A longer nickname takes precedence over its prefix.
  for (const cue of message.matchAll(/麻烦|请问|劳驾|请|叫|[@、,。!?:;\n和跟与]|^/gu)) {
    const rest=message.slice(cue.index!+cue[0].length).trimStart()
    const match=aliases.find(({name})=>rest.startsWith(name) && (cue[0]==='@' || /^(?:$|[,、:\s和跟与?!]|你|帮|看|说说|聊聊|来|觉得|能不能|要不要|方便)/u.test(rest.slice(name.length))))
    if(match) mentioned.add(match.id)
  }
  return [...mentioned]
}

export const closesRoomDiscussion=(text:string)=>/(?:^|[，,。！!\s])(?:好[的啦]?[，,]\s*)?(?:先到这[里儿]?|先这样|到此为止|(?:别|不用|不要|不必)(?:再)?(?:回复|回|说|聊|接话|补充|继续讨论)|就聊到这[里儿]?|结束(?:讨论|聊天))[啦了吧哈。！!\s]*$/u.test(text.trim())

export const asksOtherMembers=(text:string)=>/(?:其他|其余|剩下|别的)(?:的|几位)?(?:人|成员|同事|伙伴)(?:呢|怎么|觉得|也|都|说|有|想|来|[?？!！。]|$)|还有谁.{0,8}(?:说|意见|看法)/u.test(text)
