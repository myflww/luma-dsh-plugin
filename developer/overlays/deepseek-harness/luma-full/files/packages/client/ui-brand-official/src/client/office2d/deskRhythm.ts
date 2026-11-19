/** Complete authored typing loops followed by a short still pose to read the screen. */
export function sampleDeskRhythm(employeeId: string, elapsedMs: number, stripDurationMs: number, routine: boolean) {
  let seed = 0
  for (const letter of employeeId) seed = (Math.imul(seed, 31) + letter.charCodeAt(0)) >>> 0
  const rate = (routine ? 0.76 : 0.94) + (seed % 15) / 100
  const typingMs = stripDurationMs * ((routine ? 2 : 4) + seed % 3) / rate
  const readingMs = (routine ? 2000 : 1050) + seed % 950
  const time = Math.max(0, elapsedMs) % (typingMs + readingMs)
  return { reading: time >= typingMs, stripElapsedMs: time * rate, rate,
    untilChangeMs: time >= typingMs ? typingMs + readingMs - time : typingMs - time }
}
