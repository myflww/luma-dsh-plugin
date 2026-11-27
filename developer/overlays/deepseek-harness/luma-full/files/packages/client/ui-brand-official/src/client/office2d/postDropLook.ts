// Keep each axis in its current cel until it clears the threshold by 0.05
// of normalized travel, in either direction. The filtered motion stays continuous.
export function actorLookFrame(x:number,y:number,previous?:number):number {
  const step=(n:number,old:number|undefined)=>{
    if(!Number.isFinite(n))return 2
    const at=(Math.min(1,Math.max(-1,n))+1)*2
    const bias=old===undefined?0:at>old?-.1:.1
    return Math.round(at+bias)
  }
  return step(y,previous===undefined?undefined:Math.floor(previous/5))*5+
    step(x,previous===undefined?undefined:previous%5)
}

type Follow = {
  start:number; x:number; y:number; last:number
  eyeX:number; eyeY:number; headX:number; headY:number; eyes:number; head:number
}

// Each mouse release owns one reaction. Moving the pointer changes the target
// of that reaction without extending its lifetime or waking another resident.
export class PostDropLook {
  private actors=new Map<string,Follow>()

  begin(id:string, x:number, y:number, afterLanding:number) {
    this.actors.set(id,{start:afterLanding,x,y,last:afterLanding,eyeX:0,eyeY:0,headX:0,headY:0,eyes:12,head:12})
  }
  move(x:number,y:number) {
    for(const state of this.actors.values()){state.x=x;state.y=y}
  }
  cancel(id?:string) {
    if(id===undefined)this.actors.clear()
    else this.actors.delete(id)
  }
  has(id:string) {return this.actors.has(id)}

  sample(id:string,now:number,eyeX:number,eyeY:number,height:number) {
    const s=this.actors.get(id)
    if(!s || now<s.start || height<=0)return undefined
    const age=now-s.start
    if(age>=2930){this.cancel(id);return undefined}
    const aim=(delta:number,reach:number)=>Math.max(-1,Math.min(1,delta/(height*reach)))
    const x=age<2450?aim(s.x-eyeX,.36):0, y=age<2450?aim(s.y-eyeY,.30):0
    const dt=Math.max(0,now-s.last)
    const eyeRate=1-Math.exp(-dt/(age<2450?55:100))
    const headRate=1-Math.exp(-Math.max(0,now-Math.max(s.last,s.start+90))/(age<2450?165:145))
    s.eyeX+=(x-s.eyeX)*eyeRate
    s.eyeY+=(y-s.eyeY)*eyeRate
    // The head aims toward the moving eyes; a reversal can briefly show
    // eyes already across center while the head is still facing the old side.
    s.headX+=(s.eyeX-s.headX)*headRate
    s.headY+=(s.eyeY-s.headY)*headRate
    s.eyes=actorLookFrame(s.eyeX,s.eyeY,s.eyes)
    s.head=actorLookFrame(s.headX,s.headY,s.head)
    s.last=now
    return {eyeX:s.eyeX,eyeY:s.eyeY,headX:s.headX,headY:s.headY,eyes:s.eyes,head:s.head}
  }
}
