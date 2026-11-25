type PublishedTurn = {employee:string; output:string}
type RelayTurn = {
  actor: string
  names: Record<string,string>
  officialNames?: Record<string,string>
  earlier: PublishedTurn[]
  history?: PublishedTurn[]
  previousRequest?: string
  sourceTexts?: string[]
  task: string
  final: boolean
}

export function relaySpeakerInstruction(turn:RelayTurn) {
  const {actor,names,earlier,final}=turn
  const completed=earlier.map(s=>names[s.employee]).join('、') || '暂无'
  return '本轮是依次发言的接力。当前发言者是'+names[actor]+'（'+actor+'），只有你负责这条回复。宿主会用你的名字发布正文，并依次唤起同事。此前已发表贡献的成员为'+completed+'。'
    +' earlier 中每条记录都只有一位实际作者。读懂先前的交付后，用自己的口吻贡献新内容，无需再加说话人标签。引用原话要保留其真实作者，转述要写明是你的概括。不得替未发言的同事编写回应、承诺或签名。'
    +(final?' 你是最后一位。若用户要求逐人各说一句，只交付你自己的那一句。需要整合时，用自己的话给出综合结论与来源。':' 这一步只交付你负责的内容，后续成员将各自回应。')
    +' 用户要求创作或编辑的作品可以有多位人物的对白。完整交付作品，使作品人物的台词与同事在本次接力中的实际发言易于区分。'
}

const eachSpeaks=/(?:每人|每位|各自|各用|轮流|每个成员|每个角色).{0,32}?(?:自己.{0,8}口吻|各自.{0,8}口吻|一(?:句|条)|发言|发表|回复)|\beach\b.{0,65}?\b(?:own voice|own words|one sentence|one line|one comment)\b/iu
const asksForFeedback=/校对意见|修改意见|校对建议|点评|评论|反馈|审稿建议|\b(?:feedback|critique|comment on|review the)\b/iu
const dialogueForm=/(?:剧本|短剧|戏剧|舞台剧|小品|情景剧|对白|对话稿|对话片段|段对话|台词|访谈稿|聊天记录|会议纪要|角色扮演|幕戏|分镜|对话示例|第[一二三四五六七八九十\d]+幕)|\b(?:dialogue|dialog|screenplay|script|transcript|conversation|stage play|playlet)\b/iu
const authoring=/(?:创作|编写|撰写|拟写|改写|续写|写出|写一|写个|写成|写好|补写|续上|写完|给我|来一|生成|输出|翻译|转录|整理成|改成|给出|模拟|表演|演绎|提供|改编|润色)|\b(?:write|draft|compose|rewrite|translate|generate|give|provide|simulate|create|render|transcribe|format|edit|continue)\b/iu
const editingText=/(?:润色|校订|翻译|改写|誊写|转录|排版|誊录).{0,14}(?:附件|全文|全稿|原稿|逐字稿|来稿)|\b(?:edit|translate|proofread|transcribe)\b.{0,30}\b(?:attachment|manuscript|full text|verbatim)\b/iu
const continuing=/继续|接着|续上|前一稿|上一稿|第二幕|接下去|\b(?:continue|finish the previous|pick up where)\b/iu
const requestedSummary=/汇总|综合结论|总结|整合|摘要|归纳|\b(?:summarize|summarise|summary|consolidate|synthesize)\b/iu
const selfClaim=/^(?:[“「『"]\s*)?(?:我(?!国|市|省|方|司|校)|咱(?:们|俩)|I\b|we\b)/iu
const replyCue=/^(?:好[的呀啊吧][，。！!]|收到[，。！!]|嗯[，。]|没问题[，。！!]|已经核对|我核过|I(?:’|')ve\b|sure[,!])/iu

function isWorkProduct(turn:RelayTurn,answer:string) {
  const request=turn.task
  if(eachSpeaks.test(request) && asksForFeedback.test(request))return false
  if(/(?:不要|别|不用|无需).{0,6}(?:写成|编成|编写|续写|代写).{0,4}(?:剧本|对白|台词|对话)/u.test(request))return false
  if(editingText.test(request) || dialogueForm.test(request) && authoring.test(request))return true
  if(!continuing.test(request))return false
  if(turn.previousRequest && dialogueForm.test(turn.previousRequest) && authoring.test(turn.previousRequest))return true
  return /^(?:[ \t#*]*(?:第[一二三四五六七八九十\d]+幕|幕启|内景[ ·：.]|外景[ ·：.]|ACT [IVX\d]+\b|INT\.|EXT\.))/imu.test(answer.slice(0,1000))
}

const nameKey=(name:string)=>name.normalize('NFKC').trim().toLowerCase()
function authorLabels(turn:RelayTurn) {
  // Ambiguous edited names cannot establish who supposedly spoke.
  const byLabel=new Map<string,string|null>()
  for(const [id,currentName] of Object.entries(turn.names)){
    for(const alias of new Set([id,currentName,turn.officialNames?.[id] ?? currentName].map(nameKey))){
      byLabel.set(alias,!byLabel.has(alias) || byLabel.get(alias)===id ? id : null)
    }
  }
  return byLabel
}

function speakerLabel(raw:string) {
  return nameKey(raw).replace(/^#{1,6}\s+/u,'').replace(/^(?:\*\*|__|\*)\s*|\s*(?:\*\*|__|\*)$/gu,'').replace(/^[【\[]|[】\]]$/gu,'').trim()
}
function dialogueLines(answer:string,turn:RelayTurn) {
  const authors=authorLabels(turn)
  function resolveLabel(raw:string) {
    const label=speakerLabel(raw)
    // Prefer the whole configured name (which itself may contain parentheses).
    if(authors.has(label))return authors.get(label)
    return authors.get(label.replace(/\s*\([^()]{1,24}\)$/u,'').trim())
  }
  const lines:{id:string; content:string}[]=[]
  let fence='',heading=''
  for(const raw of answer.split(/\r?\n/u)){
    const marker=/^\s{0,3}(`{3,}|~{3,})/u.exec(raw)?.[1]
    if(marker){
      if(!fence)fence=marker
      else if(marker[0]===fence[0] && marker.length>=fence.length)fence=''
      heading=''
      continue
    }
    if(fence || /^(?:\s*>| {4}|\t)/u.test(raw)){heading='';continue}
    const line=raw.trim().replace(/^(?:[-*+]\s+|\d+[.)、]\s*)/u,'')
    if(!line)continue
    const header=/^(?:#{1,6}\s+(.+)|\*\*(.+)\*\*|【([^】]+)】)\s*$/u.exec(line)
    const headerId=header && resolveLabel(header[1] || header[2] || header[3]!)
    if(headerId){heading=headerId;continue}
    const tag=/^【([^】]{1,80})】\s*[：:]?\s*(\S.*)$/u.exec(line)
      ?? /^\[([^\]]{1,80})\]\s*[：:]\s*(\S.*)$/u.exec(line)
      ?? /^([^：:\n]{1,85})\s*[：:]\s*(\S.*)$/u.exec(line)
    // In **name:** the two terminating asterisks sit after the colon.
    const id=tag ? resolveLabel(tag[1]!) : undefined
    if(id)lines.push({id,content:tag![2]!.replace(/^\*\*\s*/u,'')})
    else if(heading)lines.push({id:heading,content:line})
    heading=''
  }
  return lines
}

function quotationText(value:string) {
  return value.replace(/\*\*|__/gu,'').replace(/^[“「『"]|[”」』"]$/gu,'').trim()
}

// This check targets dialogue attributed to another real participant. The output is never sliced or rewritten.
// Exact earlier contributions, attached source text, code, and deliberately requested dialogue are preserved.
export function relayNeedsRevision(answer:string,turn:RelayTurn) {
  if(isWorkProduct(turn,answer))return false
  const lines=dialogueLines(answer,turn)
  const multiSpeaker=new Set(lines.map(line=>line.id)).size>1
  const oneEach=eachSpeaks.test(turn.task)
  const oneLabelOnly=lines.length===1 && answer.trim().split(/\r?\n/u).length===1
  for(const {id,content} of lines){
    if(id===turn.actor)continue
    const words=quotationText(content)
    const previouslySpoken=turn.earlier.filter(s=>s.employee===id)
    if(!words || quotationText(turn.task).includes(words) || turn.sourceTexts?.some(text=>text.includes(words) || quotationText(text).includes(words)))continue
    if(previouslySpoken.some(s=>quotationText(s.output).includes(words)) ||
       turn.history?.some(s=>s.employee===id && quotationText(s.output).includes(words)))continue
    if(selfClaim.test(words))return true
    if(turn.final && requestedSummary.test(turn.task))continue
    if(multiSpeaker && !previouslySpoken.length && replyCue.test(words))return true
    if(oneEach && (multiSpeaker || oneLabelOnly))return true
  }
  return false
}

export const relayRevisionInstruction='刚才的草稿把本群其他成员写成了这条回复的说话人。请重新撰写当前成员自己要发表的正文，保留有效交付、代码与真实读值。对于同事已发表的内容，可写有来源的概括或准确引文。原任务要求创作的作品请清楚标为作品或代码块。不要声称重新执行了任何桌面操作。'
