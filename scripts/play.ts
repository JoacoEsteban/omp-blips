import {
  concat,
  concatMap,
  defer,
  from,
  ignoreElements,
  map,
  type Observable,
  of,
  takeUntil,
  tap,
  timer
} from 'rxjs'
import type { BlipConfig, StreamKind } from '../src/config.ts'
import { play, playback } from '../src/player.ts'
import { type Blip, gridFrom, gridPeriodMs, tonesFrom } from '../src/stream.ts'

/** How long the device stays open after the last character, in tone lengths. */
const TAIL = 6

/** A text as a character stream, one character every `delayMs`. */
export const characters = (text: string, delayMs: number): Observable<string> =>
  from(text).pipe(concatMap((char) => timer(delayMs).pipe(map(() => char))))

/**
 * Feed a phrase through the same pitch and playback path as the extension.
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
    // Arrive at the rate the grid reads, so an audition hears the preset's
    // tempo and its whole text instead of a catch-up stride skipping through.
    const periodMs = gridPeriodMs(config.tickHz)
    const delayMs = (periodMs * voice.divisor) / voice.stride
    const arrivalMs = Array.from(text).length * delayMs

    const blips = characters(text, delayMs).pipe(
      tonesFrom(
        of({ voice }),
        // The grid outlives the text by a few ticks, long enough to read the
        // tail, and then ends so the run can complete.
        gridFrom(of(config.tickHz)).pipe(
          takeUntil(timer(arrivalMs + periodMs * voice.divisor * 4))
        )
      ),
      tap((blip) => onBlip?.(blip))
    )

    // The tail holds the device open while the last tone decays.
    const commands = concat(
      blips.pipe(map(({ tone, at }) => play(tone, at))),
      timer(voice.toneMs * TAIL).pipe(ignoreElements())
    )

    return playback(of({ muted: false }), commands)
  })
