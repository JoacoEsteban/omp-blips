import type {
  MessageEndEvent,
  MessageUpdateEvent
} from '@oh-my-pi/pi-coding-agent'
import {
  concatMap,
  EMPTY,
  filter,
  from,
  groupBy,
  map,
  mergeMap,
  type MonoTypeOperatorFunction,
  type Observable,
  type OperatorFunction,
  scan,
  startWith,
  switchMap,
  throttle,
  timer,
  withLatestFrom
} from 'rxjs'
import { match, P } from 'ts-pattern'
import type { StreamKind, VoiceConfig } from './config.ts'
import { frequencyOf } from './pitch.ts'
import { type Reading, type ReadingConfig, readingOf } from './reading.ts'
import type { Tone } from './players/types.ts'

/** A slice of one stream kind, exactly as the agent delivered it. */
export interface Chunk {
  readonly kind: StreamKind
  readonly delta: string
}

/** What one kind sounds like right now. A missing voice is a silenced one. */
export interface Voicing {
  readonly voice: VoiceConfig | undefined
  /** Floor between two blips of this kind. */
  readonly minIntervalMs: number
}

/** A character that earned a tone. */
export interface Blip {
  readonly char: string
  readonly tone: Tone
}

type AssistantEvent = MessageUpdateEvent['assistantMessageEvent']

/** Prose, reasoning, and tool arguments all stream as deltas; each gets its own voice. */
export const chunkOf = (event: AssistantEvent): Chunk | undefined =>
  match(event)
    .with({ type: 'text_delta', delta: P.select(P.string) }, (delta) => ({
      kind: 'text' as const,
      delta
    }))
    .with({ type: 'thinking_delta', delta: P.select(P.string) }, (delta) => ({
      kind: 'thinking' as const,
      delta
    }))
    .with({ type: 'toolcall_delta', delta: P.select(P.string) }, (delta) => ({
      kind: 'tool' as const,
      delta
    }))
    .otherwise(() => undefined)

/**
 * A user abort or a provider failure ends the stream mid-sentence. It arrives
 * as the terminal `error` event while streaming.
 */
export const isInterrupt = (event: AssistantEvent): boolean =>
  match(event)
    .with({ type: 'error' }, () => true)
    .otherwise(() => false)

/** The same interruption seen from the finished message, in case no `error` event arrived. */
export const stoppedEarly = (message: MessageEndEvent['message']): boolean =>
  match(message)
    .with(
      { role: 'assistant', stopReason: P.union('aborted', 'error') },
      () => true
    )
    .otherwise(() => false)

/** A blip carrying the floor that applies to it, so pacing needs no ambient state. */
interface Paced extends Blip {
  readonly paceMs: number
}

/**
 * What the last character produced, and the reading that continues after it.
 * `source` is the config the cursor came from, so a voice that changes its
 * reading starts a new phrase instead of continuing an old one in a new shape.
 */
interface Count {
  readonly blip: Paced | undefined
  readonly cursor: Reading | undefined
  readonly source: ReadingConfig | undefined
}

const SILENT: Count = {
  blip: undefined,
  cursor: undefined,
  source: undefined
}

const cursorOf = ({ cursor, source }: Count, reading: ReadingConfig): Reading =>
  match({ cursor, stale: source !== reading })
    .with({ cursor: P.nonNullable, stale: false }, ({ cursor: live }) => live)
    .otherwise(() => readingOf(reading))

const toneOf = (voice: VoiceConfig, frequency: number): Tone => ({
  frequency,
  toneMs: voice.toneMs,
  decay: voice.decay,
  swell: voice.swell,
  hold: voice.hold,
  glide: voice.glide,
  material: voice.material,
  touch: voice.touch,
  volume: voice.volume
})

/**
 * One character against one voice. The reading decides both what sounds and how
 * often: it returns an index for a character that earns a blip, and nothing for
 * a character that does not.
 */
const strike = (
  count: Count,
  char: string,
  { voice, minIntervalMs }: Voicing
): Count =>
  match(voice)
    .with(P.nullish, () => ({ ...count, blip: undefined }))
    .otherwise((voiced) => {
      const [cursor, index] = cursorOf(count, voiced.reading).read(char)
      const carried = { cursor, source: voiced.reading }
      return match(index)
        .with(P.nullish, () => ({ ...carried, blip: undefined }))
        .otherwise((sounded) => ({
          ...carried,
          blip: {
            char,
            tone: toneOf(voiced, frequencyOf(sounded, voiced)),
            paceMs: minIntervalMs
          }
        }))
    })

/**
 * Drop values that arrive inside the interval their predecessor asked for. A
 * fast stream gets thinned out instead of stacked, and a zero interval lets
 * everything through.
 */
const paceBy = <T>(
  intervalMs: (value: T) => number
): MonoTypeOperatorFunction<T> =>
  throttle(
    (value) =>
      match(intervalMs(value))
        .with(P.number.lte(0), () => EMPTY)
        .otherwise((ms) => timer(ms)),
    { leading: true, trailing: false }
  )

/** Characters of one kind become paced blips. */
export const tonesFrom =
  (voicing: Observable<Voicing>): OperatorFunction<string, Blip> =>
  (characters) =>
    characters.pipe(
      withLatestFrom(voicing),
      scan((count, [char, current]) => strike(count, char, current), SILENT),
      map((count) => count.blip),
      filter((blip): blip is Paced => blip !== undefined),
      paceBy((blip) => blip.paceMs),
      map(({ char, tone }) => ({ char, tone }))
    )

/** A blip and the stream kind that produced it. */
export interface Voiced extends Blip {
  readonly kind: StreamKind
}

/**
 * Chunks become blips, one independent count per kind: the three voices are
 * meant to layer, so a hot `thinking` stream must not spend the budget that
 * `text` and `tool` blips need.
 *
 * Every `restart` begins fresh counts. A finished or interrupted message must
 * not leave a half-spent budget behind for the next one.
 */
export const blipsFrom = (
  chunks: Observable<Chunk>,
  voicing: (kind: StreamKind) => Observable<Voicing>,
  restart: Observable<unknown>
): Observable<Voiced> =>
  restart.pipe(
    startWith(undefined),
    switchMap(() =>
      chunks.pipe(
        groupBy((chunk) => chunk.kind),
        mergeMap((kind) =>
          kind.pipe(
            concatMap((chunk) => from(chunk.delta)),
            tonesFrom(voicing(kind.key)),
            map((blip) => ({ ...blip, kind: kind.key }))
          )
        )
      )
    )
  )
