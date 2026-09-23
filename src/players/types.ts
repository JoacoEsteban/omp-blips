import type { Observable } from 'rxjs'
import type { Sound } from '../synth.ts'

/** One scheduled blip: everything a backend needs to make a sound. */
export interface Tone extends Sound {
  readonly volume: number
}

/**
 * What a backend is asked to do. `flush` silences what is ringing now but keeps
 * the device, so the next tone still starts without a spawn.
 */
export type PlayCommand =
  { readonly type: 'play'; readonly tone: Tone } | { readonly type: 'flush' }

export const play = (tone: Tone): PlayCommand => ({ type: 'play', tone })
export const flush = (): PlayCommand => ({ type: 'flush' })

/**
 * A backend is a function from commands to a running device: subscribing opens
 * it, unsubscribing releases it, and it completes once the commands are done
 * and nothing is ringing. It emits nothing — the sound is the effect.
 *
 * The command stream must be hot: a backend may subscribe to it more than once.
 */
export type Backend = (commands: Observable<PlayCommand>) => Observable<never>
