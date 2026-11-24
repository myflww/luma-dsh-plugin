// Rank within one already-authorized role/scope. Segmentation keeps short Chinese
// field names and Latin project IDs searchable without transporting every portrait.
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const filler = new Set(('我们 你们 他们 自己 用户 角色 什么 怎么 如何 这样 这个 那个 哪些 多少 一下 一个 一项 有关 关于 之前 此前 以前 上次 当时 亲自 ' +
  '知道 记得 记住 回忆 告诉 回复 回答 查查 提供 继续 使用 需要 帮我 帮忙 请问 是否 能否 可以 有没有 有过 还有 一起 完成 ' +
  '长期 偏好 习惯 约定 工作 协作 任务 项目 栏目 取值 原文 填写 未知 完整 这里 里面 现在 今天 明天 以后 ' +
  'please what which where who can could have did remember meant should would this that into with from about usual usually prefer preferences').split(' '))
const overview = /^(?:(?:我的)?(?:笔记|用户画像|偏好|习惯)|(?:你(?:还)?(?:记得|知道|了解)|总结(?:一下)?|列出)(?:我(?:的)?|我们)(?:(?:哪些|什么|有(?:哪些|什么)|的|长期|个人|偏好|习惯|约定|事情|多少|情况|信息|吗|呢|呀|都|还|曾经|过))*)[？?。！!\s]*$/u

export function memoryMatch(query: string) {
  const normalized = query.normalize('NFKC').toLowerCase()
  const terms = new Map<string, number>()
  const wholeTerms = new Set<string>()
  for (const {segment, isWordLike} of segmenter.segment(normalized)) {
    if (!isWordLike || segment.length < 2 || filler.has(segment)) continue
    wholeTerms.add(segment)
    terms.set(segment, Math.min(10, segment.length * 2))
    // A compound in the question can be split differently in a stored sentence.
    if (segment.length >= 3 && /^\p{Script=Han}+$/u.test(segment)) {
      for (let i = 1; i < segment.length; i++) {
        const pair = segment.slice(i - 1, i + 1)
        if (!filler.has(pair) && !terms.has(pair)) terms.set(pair, 1)
      }
    }
    if (terms.size >= 100) break
  }
  // ICU may split a specialized field name such as 清样页脚 into single
  // characters. Recover adjacent meaningful pairs at a lower weight.
  for (const run of normalized.match(/\p{Script=Han}{2,}/gu) ?? []) {
    for (let i=1;i<run.length && terms.size<140;i++) {
      const pair=run.slice(i-1,i+1)
      if (!/[的了我你它在从请是有吗呢与和把将为中个就来]/u.test(pair) && !filler.has(pair) && !terms.has(pair)) terms.set(pair,1)
    }
    if (terms.size>=140) break
  }
  const browse = overview.test(normalized.trim()) ||
    /^(?:(?:你?还?记得|看看|查看|翻一下)(?:我的|以前的)?(?:笔记|备注|记录)(?:吗)?|(?:private\s+)?follow[- ]?up|接着(?:刚才|之前|上次)(?:说|聊|做))[？?。！!\s]*$/iu.test(normalized.trim())
  return {
    browse,
    sharesTopic(value:string) {
      if (browse) return false
      const text=value.normalize('NFKC').toLowerCase()
      const common=[...wholeTerms].filter(term=>text.includes(term))
      return common.some(term=>term.length>=4) || common.length>=2
    },
    mentions(project:string) {
      const name=project.normalize('NFKC').toLowerCase()
      let start=normalized.indexOf(name)
      while (start>=0) {
        const before=normalized[start-1] ?? '', after=normalized[start+name.length] ?? ''
        const suffix=normalized.slice(start+name.length)
        const longerTitle=/^[\p{L}\d_-]+[》」”]/u.test(suffix) || /^(?!项目|工程|系列|这个项目|这项工程)\p{Script=Han}{1,10}(?:项目|工程|系列)/u.test(suffix)
        if (!(/[a-z0-9_-]/.test(name[0]!) && /[a-z0-9_-]/.test(before)) &&
            !(/[a-z0-9_-]/.test(name.at(-1)!) && /[a-z0-9_-]/.test(after)) && !longerTitle) return true
        start=normalized.indexOf(name,start+name.length)
      }
      return false
    },
    score(value: string) {
      const text = value.normalize('NFKC').toLowerCase()
      let score = 0
      for (const [term, weight] of terms) if (text.includes(term)) score += weight
      return score
    },
  }
}
