/** Authored keystrokes at two paces, with hands at rest while reading and checking an edit. */
export function sampleDeskRhythm(employeeId: string, elapsedMs: number, stripDurationMs: number, routine: boolean) {
  let seed = 0
  for (const letter of employeeId) seed = (Math.imul(seed, 31) + letter.charCodeAt(0)) >>> 0
  const rate = (routine ? 0.76 : 0.94) + (seed % 15) / 100
  const typingMs = stripDurationMs * ((routine ? 2 : 4) + seed % 3) / rate
  const readingMs = (routine ? 2100 : 1050) + seed % 1200
  const editRate = rate * (.64 + (seed >>> 5) % 17 / 100)
  const editMs = stripDurationMs * (1 + (seed >>> 3) % 2) / editRate
  const checkingMs = 420 + (seed >>> 9) % 550
  const cycle = typingMs + readingMs + editMs + checkingMs
  // A working session begins with the first whole hand pose. Colleagues who
  // were already at their desks are partway through individual cycles.
  let time=(Math.max(0,elapsedMs) + (routine ? seed % Math.ceil(cycle) : 0)) % cycle
  if (time < typingMs) return {reading:false,stripElapsedMs:time*rate,rate,untilChangeMs:typingMs-time}
  time-=typingMs
  if (time < readingMs) return {reading:true,stripElapsedMs:0,rate,untilChangeMs:readingMs-time}
  time-=readingMs
  if (time < editMs) return {reading:false,stripElapsedMs:time*editRate,rate:editRate,untilChangeMs:editMs-time}
  return {reading:true,stripElapsedMs:0,rate,untilChangeMs:cycle-(typingMs+readingMs+time)}
}
