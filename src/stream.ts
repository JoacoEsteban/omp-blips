import type {
  MessageEndEvent,
  MessageUpdateEvent
} from '@oh-my-pi/pi-coding-agent'
import {
  distinctUntilChanged,
  filter,
  groupBy,
  ignoreElements,
  interval,
  map,
  merge,
  mergeMap,
  type Observable,
  type OperatorFunction,
  scan,
  share,
  startWith,
  switchMap,
  withLatestFrom
} from 'rxjs'
import { match, P } from 'ts-pattern'
import type { StreamKind, VoiceConfig } from './config.ts'
import { colorOf } from './color.ts'
import { frequencyOf } from './pitch.ts'
import { spatialOf } from './spatial.ts'
import { type Reading, type ReadingConfig, readingOf } from './reading.ts'
import { TICK_MS } from './players/mixer.ts'
import type { Tone } from './players/types.ts'

/** A slice of one stream kind, exactly as the agent delivered it. */
export interface Chunk {
  readonly kind: StreamKind
  readonly delta: string
}

/** What one kind sounds like right now. A missing voice is a silenced one. */
export interface Voicing {
  readonly voice: VoiceConfig | undefined
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

/** The effective period shared by playback and audition scheduling. */
export const gridPeriodMs = (hz: number): number =>
  Math.max(TICK_MS, Math.round(1000 / hz / TICK_MS) * TICK_MS)

/**
 * The grid every voice sounds on, numbered so a voice can take every `n`th
 * tick. One timer, shared: three timers at three rates would drift apart and
 * the voices with them.
 *
 * The period is snapped to a whole number of mixer ticks. The mixer starts a
 * tone at the head of the block it is writing, so a period off its own grid
 * would land tones a tick early or late at random. That wobble is inaudible on
 * a screen and very audible in a beat.
 */
export const gridFrom = (tickHz: Observable<number>): Observable<number> =>
  tickHz.pipe(
    map(gridPeriodMs),
    distinctUntilChanged(),
    switchMap((periodMs) => interval(periodMs)),
    share()
  )

/**
 * Ticks the cursor is given to close whatever gap it finds. The stride widens
 * with the backlog so a burst is crossed in about this many ticks; the grid
 * itself never moves, so catching up costs text resolution and not tempo.
 */
const CATCHUP_TICKS = 8

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * Graphemes, not code units: an emoji or an accented letter is one thing to
 * read and so one thing to sound. A cluster split across two deltas counts as
 * two, which costs one extra blip at a boundary and nothing else.
 */
const countGraphemes = (text: string): number => {
  const walk = segmenter.segment(text)[Symbol.iterator]()
  let count = 0
  while (!walk.next().done) count += 1
  return count
}

/** The last character in a span that the reading gave an index to. */
interface Sounded {
  readonly char: string
  readonly index: number
}

/** How far a span took the cursor, and what it left to sound. */
interface Walked {
  readonly reading: Reading
  /** Code units consumed, so the caller can drop the prefix it spent. */
  readonly end: number
  readonly taken: number
  readonly sounded: Sounded | undefined
}

/**
 * Read `units` graphemes and keep the last index they produced. A span rather
 * than a point, so a stride that lands on a space still sounds what it crossed
 * instead of leaving a hole in the grid. A span of pure whitespace sounds
 * nothing, which is the rest the text asked for.
 */
const walk = (reading: Reading, text: string, units: number): Walked => {
  let cursor = reading
  let end = 0
  let taken = 0
  let sounded: Sounded | undefined
  for (const { segment } of segmenter.segment(text)) {
    if (taken >= units) break
    const [next, index] = cursor.read(segment)
    cursor = next
    end += segment.length
    taken += 1
    if (index !== undefined) sounded = { char: segment, index }
  }
  return { reading: cursor, end, taken, sounded }
}

/**
 * Where one voice has got to. `pending` is the text the cursor has not reached
 * and `backlog` is its length in graphemes, kept alongside so a tick costs the
 * stride and not the whole buffer. `source` is the config the reading came
 * from, so a voice that changes its reading starts a new phrase instead of
 * continuing an old one in a new shape.
 */
interface Cursor {
  readonly pending: string
  readonly backlog: number
  /** Never shrink a catch-up stride until the buffer is empty. */
  readonly catchupStride: number
  readonly reading: Reading | undefined
  readonly source: ReadingConfig | undefined
  /** Number of blips emitted since this cursor boundary. */
  readonly ordinal: number
  readonly blip: Blip | undefined
}

const START: Cursor = {
  pending: '',
  backlog: 0,
  catchupStride: 0,
  reading: undefined,
  source: undefined,
  ordinal: 0,
  blip: undefined
}

const readingFor = (
  { reading, source }: Cursor,
  config: ReadingConfig
): Reading =>
  match({ reading, stale: source !== config })
    .with({ reading: P.nonNullable, stale: false }, ({ reading: live }) => live)
    .otherwise(() => readingOf(config))

const toneOf = (
  voice: VoiceConfig,
  index: number,
  selected: string,
  ordinal: number
): Tone => ({
  frequency: frequencyOf(index, voice),
  toneMs: voice.toneMs,
  decay: voice.decay,
  swell: voice.swell,
  hold: voice.hold,
  glide: voice.glide,
  // Pitch and colour read the same index and answer different questions: what
  // note the character is, and what mouth shape it is said with.
  color: colorOf(index, voice.color),
  material: voice.material,
  touch: voice.touch,
  volume: voice.volume,
  spatial: spatialOf(selected, ordinal, voice.spatial)
})

/** One sounding: walk the stride, or more of it when the text got ahead. */
const drain = (cursor: Cursor, voice: VoiceConfig): Cursor => {
  const catchupStride = Math.max(
    cursor.catchupStride,
    Math.ceil(cursor.backlog / CATCHUP_TICKS)
  )
  const walked = walk(
    readingFor(cursor, voice.reading),
    cursor.pending,
    Math.max(voice.stride, catchupStride)
  )
  return {
    pending: cursor.pending.slice(walked.end),
    backlog: cursor.backlog - walked.taken,
    catchupStride: match(walked.end === cursor.pending.length)
      .with(true, () => 0)
      .with(false, () => catchupStride)
      .exhaustive(),
    reading: walked.reading,
    source: voice.reading,
    ordinal: match(walked.sounded)
      .with(P.nullish, () => cursor.ordinal)
      .otherwise(() => cursor.ordinal + 1),
    blip: match(walked.sounded)
      .with(P.nullish, () => undefined)
      .otherwise(({ char, index }) => ({
        char,
        tone: toneOf(voice, index, char, cursor.ordinal)
      }))
  }
}

/** Text arriving and the grid ticking are the only two things that happen. */
type Pulse =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tick'; readonly at: number }

/**
 * A delta only moves the far end of the buffer; the grid is what sounds. A
 * silenced voice keeps no buffer, so turning it back on starts from now
 * instead of dumping everything it missed.
 */
const step = (cursor: Cursor, pulse: Pulse, { voice }: Voicing): Cursor =>
  match(voice)
    .with(P.nullish, () => START)
    .otherwise((voiced) =>
      match(pulse)
        .with({ type: 'text', text: P.select() }, (text) => ({
          ...cursor,
          pending: cursor.pending + text,
          backlog: cursor.backlog + countGraphemes(text),
          blip: undefined
        }))
        .with({ type: 'tick', at: P.number.select() }, (at) =>
          match(at % voiced.divisor === 0 && cursor.backlog > 0)
            .with(false, () => ({ ...cursor, blip: undefined }))
            .with(true, () => drain(cursor, voiced))
            .exhaustive()
        )
        .exhaustive()
    )

/**
 * Deltas of one kind become blips on the shared grid. Arrival fills a buffer
 * and the grid empties it, so the rate you hear is the preset's and the notes
 * you hear are the text's.
 */
export const tonesFrom =
  (
    voicing: Observable<Voicing>,
    ticks: Observable<number>
  ): OperatorFunction<string, Blip> =>
  (deltas) =>
    merge(
      deltas.pipe(map((text): Pulse => ({ type: 'text', text }))),
      ticks.pipe(map((at): Pulse => ({ type: 'tick', at })))
    ).pipe(
      withLatestFrom(voicing),
      scan((cursor, [pulse, current]) => step(cursor, pulse, current), START),
      map((cursor) => cursor.blip),
      filter((blip): blip is Blip => blip !== undefined)
    )

/** A blip and the stream kind that produced it. */
export interface Voiced extends Blip {
  readonly kind: StreamKind
}

/**
 * Chunks become blips, one independent cursor per kind: the three voices are
 * meant to layer, so a hot `thinking` stream must not drag `text` and `tool`
 * along with it. They share one `ticks` grid, which is what keeps them locked
 * to each other instead of slowly drifting apart.
 *
 * Every `restart` begins fresh cursors. A finished or interrupted message must
 * not leave its unread tail behind for the next one.
 */
export const blipsFrom = (
  chunks: Observable<Chunk>,
  voicing: (kind: StreamKind) => Observable<Voicing>,
  restart: Observable<unknown>,
  ticks: Observable<number>
): Observable<Voiced> =>
  merge(
    // Keep the clock subscribed while a restart replaces all of its cursors.
    ticks.pipe(ignoreElements()),
    restart.pipe(
      startWith(undefined),
      switchMap(() =>
        chunks.pipe(
          groupBy((chunk) => chunk.kind),
          mergeMap((kind) =>
            kind.pipe(
              map((chunk) => chunk.delta),
              tonesFrom(voicing(kind.key), ticks),
              map((blip) => ({ ...blip, kind: kind.key }))
            )
          )
        )
      )
    )
  )
