// Only suppress full repeated prose. Keep short acknowledgements, quotations, code and data.
const wantsExactText=/复述|重复|引用|原(?:文|话|句|样)|逐字|同一句|一字不(?:差|改)|照(?:说|读|抄|念|写|着)|跟(?:读|我念|我说)|再(?:说|讲|念|发|答).{0,6}(?:一次|一遍)|只(?:需|要)?(?:回复|回答|输出)|(?:固定|相同|同样|统一).{0,8}(?:回复|答案|措辞|口径|说)|\b(?:repeat|quote|verbatim|exact(?:ly)?|same (?:answer|reply)|reply (?:only|with))\b/iu

function proseKey(text:string) {
  // Preserve words, numbers, negation, questions and all interior punctuation.
  return text.trim().replace(/\r\n/gu,'\n').replace(/[。！!]$/u,'')
}

export function repeatedRoomChat(answer:string, request:string, previous:string[]) {
  const instruction=request.replace(/(?:不要|不用|不必|无需|避免|别)(?:再)?(?:重复|复述|引用)/gu,'')
  if (!previous.length || wantsExactText.test(instruction) || request.includes(answer.trim())) return false
  if (/[\p{N}\p{S}\x60{}\[\]<>"“”「」『』]|^(?: {4}|\t|>)/mu.test(answer)) return false
  const key=proseKey(answer)
  if ((key.match(/\p{L}/gu)?.length ?? 0)<32) return false
  return previous.some(text=>proseKey(text)===key)
}
