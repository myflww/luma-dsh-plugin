type Routine = { desk:string; destination:readonly [number,number]; firstBreak:number; pause:number }

// Preferred places in the common 1672 × 941 room coordinate system. Each
// renderer chooses a reachable action point in its own floor plan.
const routines:Record<string,Routine> = {
  jingyuniang:{desk:'整理航海手记',destination:[830,365],firstBreak:24_000,pause:4_800},
  shan:{desk:'校对画稿',destination:[560,420],firstBreak:46_000,pause:5_700},
  'bai-shuangming':{desk:'查阅资料',destination:[1190,470],firstBreak:92_000,pause:6_200},
  'lu-mi':{desk:'编辑乐谱',destination:[1340,630],firstBreak:112_000,pause:5_100},
  longmama:{desk:'整理日记',destination:[480,610],firstBreak:76_000,pause:5_500},
  claude:{desk:'编排手账',destination:[760,635],firstBreak:61_000,pause:4_200},
  gemini:{desk:'归档笔记',destination:[1050,380],firstBreak:129_000,pause:5_900},
  grok:{desk:'推演谜题',destination:[890,755],firstBreak:36_000,pause:3_800},
}
export function officeDailyRoutine(employeeId:string) { return routines[employeeId] }

/** Turn toward the next destination before stepping off, holding the feet in place. */
export function faceNextStop(x:number,y:number,toX:number,toY:number) {
  const dx=toX-x,dy=toY-y
  return Math.abs(dx)>Math.abs(dy) ? dx>0?'right':'left' : dy>0?'down':'up'
}

/** A familiar short outing, with every third trip free to explore the rest of the room. */
export function dailyWalkTarget<T>(id:string, ordinal:number, candidates:readonly T[], point:(value:T)=>readonly [number,number], random:number) {
  const routine=routines[id]
  if(!routine || ordinal%3===2 || candidates.length<2) return candidates[random%Math.max(1,candidates.length)]
  const distance=(a:T)=>{const [x,y]=point(a);return Math.hypot(x-routine.destination[0],y-routine.destination[1])}
  const nearest=[...candidates].sort((a,b)=>distance(a)-distance(b)).slice(0,2)
  return nearest[ordinal%2]
}
