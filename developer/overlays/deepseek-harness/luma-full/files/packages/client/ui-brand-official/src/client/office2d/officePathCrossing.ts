type Point = readonly [number, number]

export interface OfficePathStep {
  id: string
  from: Point
  to: Point
  working: boolean
}

/** Short sidestep for two floor paths inside one footprint. Opposing walkers pass on a side, not through each other. */
export function personalSpaceStep(id:string, foot:Point, heading:Point, other:{id:string;foot:Point;heading?:Point}):Point {
  const dx=foot[0]-other.foot[0], dy=foot[1]-other.foot[1]
  const gap=Math.hypot(dx,dy)
  if(gap>=22)return foot
  const share=other.heading ? .5 : 1
  const opposing=!other.heading || heading[0]*other.heading[0]+heading[1]*other.heading[1]<-.7
  if(opposing){
    const vx=heading[0]-(other.heading?.[0]??0),vy=heading[1]-(other.heading?.[1]??0),length=Math.hypot(vx,vy)
    if(length>.01){
      const along=(dx*vx+dy*vy)/length,side=(-dx*vy+dy*vx)/length
      const needed=Math.sqrt(Math.max(0,22*22-along*along))
      const correction=((side < -2 ? -needed : needed)-side)*share
      return [foot[0]-vy/length*correction,foot[1]+vx/length*correction]
    }
  }
  const amount=(22-gap)*share
  return gap>.01?[foot[0]+dx/gap*amount,foot[1]+dy/gap*amount]:[foot[0]+(id<other.id?-amount:amount),foot[1]]
}

export function walkingHeading(from:Point,to:Point):Point {
  const dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy)
  return length>.01?[dx/length,dy/length]:[0,0]
}

/** Reserve the crossing itself, including intersections between two differently named routes. */
export function yieldsAtOfficeCrossing(self: OfficePathStep, other: OfficePathStep): boolean {
  const dx = other.from[0] - self.from[0], dy = other.from[1] - self.from[1]
  if (self.id === other.id || Math.hypot(dx, dy) > 130) return false
  const ax = self.to[0] - self.from[0], ay = self.to[1] - self.from[1]
  const bx = other.to[0] - other.from[0], by = other.to[1] - other.from[1]
  const a = Math.hypot(ax, ay), b = Math.hypot(bx, by)
  if (a < .01 || b < .01) return false

  const ux = ax/a, uy = ay/a, vx = bx/b, vy = by/b
  const alignment = ux*vx + uy*vy
  const sharedTarget = Math.hypot(self.to[0]-other.to[0],self.to[1]-other.to[1]) < 1
  if (alignment > .93 && Math.abs(dx*uy - dy*ux) < 16) {
    // A faster follower cannot overtake a colleague on the same half-lane.
    const lead = dx*ux + dy*uy
    return lead > .1 && lead < 33 || Math.abs(lead) <= .1 && other.id < self.id
  }
  const cross = ux*vy - uy*vx
  // Opposite directions share an edge using the renderers' separate right-hand lanes.
  if (!sharedTarget && (Math.abs(cross) < .12 || alignment < -.93)) return false
  const selfDistance = sharedTarget ? a : (dx*vy - dy*vx)/cross
  const otherDistance = sharedTarget ? b : (dx*uy - dy*ux)/cross
  const clearance = 27
  if (selfDistance < 0 || selfDistance > Math.min(63, a + .1)
    || otherDistance < -clearance || otherDistance > Math.min(63, b + .1)) return false
  // Once someone enters the junction, even a newly assigned task waits for them to clear it.
  if (otherDistance < clearance && selfDistance >= clearance) return true
  if (selfDistance < clearance && otherDistance >= clearance) return false
  if (otherDistance < 0) return true
  if (self.working !== other.working) return other.working
  return otherDistance < selfDistance - .1 || Math.abs(otherDistance - selfDistance) <= .1 && other.id < self.id
}
