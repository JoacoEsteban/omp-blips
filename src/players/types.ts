import type { Observable } from 'rxjs'
import type { ToneSpatial } from '../spatial.ts'
import type { Sound } from '../synth.ts'
/** One scheduled blip: everything a backend needs to make a sound. */
export interface Tone extends Sound {
  readonly volume: number
  readonly spatial: ToneSpatial
}

/**
 * What a backend is asked to do. `flush` silences what is ringing now but keeps
 * the device, so the next tone still starts without a spawn. A `play` carries
 * the moment it was meant for, so a backend can place it at that sample rather
 * than at whatever boundary it happens to be writing.
 */
export type PlayCommand =
  | { readonly type: 'play'; readonly tone: Tone; readonly at: number }
  | { readonly type: 'flush' }

export const play = (tone: Tone, at: number): PlayCommand => ({
  type: 'play',
  tone,
  at
})
export const flush = (): PlayCommand => ({ type: 'flush' })

/**
 * A backend is a function from commands to a running device: subscribing opens
 * it, unsubscribing releases it, and it completes once the commands are done
 * and nothing is ringing. It emits nothing — the sound is the effect.
 *
 * The command stream must be hot: a backend may subscribe to it more than once.
 */
export type Backend = (commands: Observable<PlayCommand>) => Observable<never>
