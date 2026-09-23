import { spawn } from 'node:child_process'
import {
  BehaviorSubject,
  defer,
  filter,
  finalize,
  mergeMap,
  Observable,
  type OperatorFunction,
  takeUntil
} from 'rxjs'
import { toneFile } from '../tone.ts'
import type { Backend, PlayCommand, Tone } from './types.ts'

/** Above this, audio is lagging behind the stream; drop instead of queueing. */
const MAX_CONCURRENT = 6

/** One `afplay` process for one tone. Unsubscribing kills it. */
const sound = (tone: Tone): Observable<never> =>
  new Observable<never>((subscriber) => {
    const child = spawn(
      'afplay',
      ['-v', tone.volume.toFixed(3), toneFile(tone)],
      {
        stdio: 'ignore'
      }
    )
    let running = true
    const finished = (): void => {
      running = false
      subscriber.complete()
    }
    child.on('error', finished)
    child.on('exit', finished)
    child.unref()

    return () => {
      if (running) child.kill('SIGKILL')
    }
  })

/**
 * Run at most `limit` effects at a time and drop the values that arrive while
 * the limit is reached. Queueing them would play a tone for text that scrolled
 * past; a missing blip is the cheaper failure.
 */
const dropOverflow =
  <T>(
    limit: number,
    effect: (value: T) => Observable<never>
  ): OperatorFunction<T, never> =>
  (source) =>
    defer(() => {
      const live = new BehaviorSubject(0)

      return source.pipe(
        filter(() => live.value < limit),
        mergeMap((value) =>
          defer(() => {
            live.next(live.value + 1)
            return effect(value)
          }).pipe(finalize(() => live.next(live.value - 1)))
        )
      )
    })

/**
 * One short-lived `afplay` per blip against a cached WAV. No dependencies
 * beyond macOS itself; the cost is a process spawn (~50 ms) before each tone is
 * audible, and overlapping tones are racing processes rather than a mix.
 *
 * Nothing to fade on a flush: an `afplay` process is either running or killed,
 * so a flush simply unsubscribes from the ones that are running.
 */
export const afplay = (): Backend => (commands) => {
  const flushed = commands.pipe(filter((command) => command.type === 'flush'))

  return commands.pipe(
    filter(
      (command): command is Extract<PlayCommand, { type: 'play' }> =>
        command.type === 'play'
    ),
    dropOverflow(MAX_CONCURRENT, ({ tone }) =>
      sound(tone).pipe(takeUntil(flushed))
    )
  )
}
