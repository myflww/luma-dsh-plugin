import type { ActorGesture } from './actorGestureAtlas.ts'
import { actorMotionFrame, LANDING_MS, type ActorMotion, type GripLag } from './actorMotion.ts'

interface Exposure {
  frame: number
  gesture?: string
}

const duration = (holds: readonly number[]) => holds.reduce((sum, ms) => sum + ms, 0)

/** The next action belongs to the character, while the current breathing
 * and gesture clock belongs to one uninterrupted period of standing. */
export class IdleGestureSequence {
  private first: number | undefined
  private next: number | undefined
  private waitingForArt = 0
  private firstGestureAt = 0

  interrupt() {
    this.first = undefined
    this.waitingForArt = 0
  }

  sample(motion: ActorMotion, elapsed: number, phase: number, lag: GripLag | undefined,
    still: boolean, idleDurations: readonly number[], actions?: readonly ActorGesture[],
    releasedPose?: number): Exposure {
    const idleElapsed = elapsed - (motion === 'landing' ? LANDING_MS : 0)
    if (still || motion === 'held' || idleElapsed < 0 || actions?.length !== 2) {
      this.interrupt()
      if (!still && motion !== 'held' && idleElapsed >= 0) this.waitingForArt = idleElapsed
      return { frame: actorMotionFrame(motion, elapsed, phase, lag, still, idleDurations, releasedPose) }
    }

    const rest = duration(idleDurations)
    if (this.first === undefined) {
      this.first = this.next ?? phase % 2
      // If the extra sheet arrived late, finish the visible breathing loop
      // before changing paintings. Never join mid-stretch after a slow download.
      const loops = Math.max(1, Math.ceil((this.waitingForArt - phase) / rest))
      this.firstGestureAt = phase + loops * rest
    }
    const elapsedSinceFirst = idleElapsed - this.firstGestureAt
    if (elapsedSinceFirst < 0) {
      return { frame: actorMotionFrame('idle', idleElapsed, phase, undefined, false, idleDurations) }
    }

    // Alternate the two authored clips. Each one starts and ends neutral,
    // and a complete breathing loop fills the interval between them.
    const lengths = actions.map(action => duration(action.durationsMs))
    let within = elapsedSinceFirst % (lengths[0]! + lengths[1]! + 2 * rest)
    for (const which of [this.first, 1 - this.first]) {
      const action = actions[which]!
      this.next = 1 - which
      if (within < lengths[which]!) {
        for (const [beat, hold] of action.durationsMs.entries()) {
          if (within < hold) return { gesture: action.id, frame: action.frames[beat]! }
          within -= hold
        }
      }
      within -= lengths[which]!
      if (within < rest) return { frame: actorMotionFrame('idle', within, 0, undefined, false, idleDurations) }
      within -= rest
    }
    return { frame: 0 }
  }
}

export function gestureSequenceFor(sequences: Map<string, IdleGestureSequence>, costume: string) {
  let sequence = sequences.get(costume)
  if (!sequence) {
    sequence = new IdleGestureSequence()
    sequences.set(costume, sequence)
  }
  return sequence
}
