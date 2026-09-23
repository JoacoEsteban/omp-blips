import {
  concat,
  concatMap,
  defer,
  from,
  ignoreElements,
  map,
  type Observable,
  of,
  tap,
  timer
} from 'rxjs'
import type { BlipConfig, StreamKind } from '../src/config.ts'
import { play, playback } from '../src/player.ts'
import { type Blip, tonesFrom } from '../src/stream.ts'

/** How long the device stays open after the last character, in tone lengths. */
const TAIL = 6

/** A text as a character stream, one character every `delayMs`. */
export const characters = (text: string, delayMs: number): Observable<string> =>
  from(text).pipe(concatMap((char) => timer(delayMs).pipe(map(() => char))))

/**
 * Feed a phrase through the same pitch path and backend the extension uses.
 * The observable is the whole run: subscribing starts it, unsubscribing stops
 * it, and it completes once the last tone has rung out.
 */
export const playText = (
  config: BlipConfig,
  kind: StreamKind,
  text: string,
  onBlip?: (blip: Blip) => void
): Observable<never> =>
  defer(() => {
    const voice = config.voices[kind]
    const blips = characters(text, config.minIntervalMs).pipe(
      tonesFrom(of({ voice, minIntervalMs: config.minIntervalMs })),
      tap((blip) => onBlip?.(blip))
    )

    // The tail holds the device open while the last tone decays.
    const commands = concat(
      blips.pipe(map(({ tone }) => play(tone))),
      timer(voice.toneMs * TAIL).pipe(ignoreElements())
    )

    return playback(of({ backend: config.backend, muted: false }), commands)
  })
