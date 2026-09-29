import type { Theme } from '@oh-my-pi/pi-coding-agent'
import {
  BehaviorSubject,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  type Observable,
  repeat,
  switchMap,
  timer
} from 'rxjs'
import { match, P } from 'ts-pattern'
import { type Arrival, arrivalOf } from './arrival.ts'
import type { ColorConfig } from './color.ts'
import {
  type BlipConfig,
  type StreamKind,
  STREAM_KINDS,
  type VoiceConfig
} from './config.ts'
import { keyOf, type Key } from './keys.ts'
import type { PitchConfig } from './pitch.ts'
import { play, type PlayCommand } from './player.ts'
import { type PresetName, PRESET_NAMES, presets } from './presets.ts'
import type { ReadingConfig } from './reading.ts'
import {
  EMPTY_SAMPLE,
  loadSamples,
  type Sample,
  type Samples
} from './samples.ts'
import { loadSettings } from './settings.ts'
import { gridFrom, tonesFrom, type Voicing } from './stream.ts'

const DEFAULT_DELAY_MS = 10
/** A provider that delivers faster than this is not one you will meet. */
const MIN_DELAY_MS = 4
const MAX_DELAY_MS = 1_000
const SPEED_STEPS = 50
const PRESET_ROWS = 7
const PREVIEW_ROWS = 3
/** Characters kept for the preview: more than the widest terminal can show. */
const PREVIEW_LIMIT = 600
const NAME_WIDTH = 11
const LABEL_WIDTH = 7

export interface Tuning {
  readonly presetIndex: number
  readonly config: BlipConfig
  /** The preset the config file names today. */
  readonly saved: PresetName
  readonly kind: StreamKind
  readonly sample: Sample
  readonly speedIndex: number
  readonly offset: number
  readonly streamed: string
  readonly paused: boolean
}

export type Step =
  | { readonly type: 'tune'; readonly tuning: Tuning }
  /** The dialog is over; a preset means keep it, nothing means leave the file alone. */
  | { readonly type: 'close'; readonly preset: PresetName | undefined }

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

const cycle = (current: number, delta: number, length: number): number =>
  (current + delta + length) % length

/**
 * The slider is geometric: one step is a constant ratio, so the slow end moves
 * in coarse steps and the fast end in fine ones.
 */
const delayFor = (speedIndex: number): number =>
  Math.ceil(
    MAX_DELAY_MS *
      (MIN_DELAY_MS / MAX_DELAY_MS) **
        (clamp(speedIndex, 0, SPEED_STEPS) / SPEED_STEPS)
  )

const speedFor = (delayMs: number): number =>
  Math.round(
    (Math.log(delayMs / MAX_DELAY_MS) / Math.log(MIN_DELAY_MS / MAX_DELAY_MS)) *
      SPEED_STEPS
  )

const DEFAULT_SPEED_INDEX = speedFor(DEFAULT_DELAY_MS)

const presetAt = (index: number): PresetName => PRESET_NAMES[index] ?? 'default'

export const presetOf = (tuning: Tuning): PresetName =>
  presetAt(tuning.presetIndex)

const configFor = (preset: PresetName): BlipConfig =>
  loadSettings(preset).config

const voiceOf = (tuning: Tuning): VoiceConfig =>
  tuning.config.voices[tuning.kind]

/** The dialog auditions the preset whatever the config says, as the device does. */
export const voicingFor = (tuning: Tuning): Voicing => ({
  voice: voiceOf(tuning)
})

interface Clock {
  readonly paused: boolean
  /** Graphemes a second, averaged over the deltas the reading arrives in. */
  readonly charsPerSecond: number
}

const clockFor = (tuning: Tuning): Clock => ({
  paused: tuning.paused || tuning.sample.text.length === 0,
  charsPerSecond: 1000 / delayFor(tuning.speedIndex)
})

const sameClock = (left: Clock, right: Clock): boolean =>
  left.paused === right.paused && left.charsPerSecond === right.charsPerSecond

const rewound = (tuning: Tuning): Tuning => ({
  ...tuning,
  offset: 0,
  streamed: ''
})

const resampled = (tuning: Tuning, samples: Samples): Tuning =>
  rewound({ ...tuning, sample: samples.of(tuning.kind) })

const moved = (tuning: Tuning, delta: number): Tuning => {
  const presetIndex = cycle(tuning.presetIndex, delta, PRESET_NAMES.length)
  return { ...tuning, presetIndex, config: configFor(presetAt(presetIndex)) }
}

const kindAt = (index: number): StreamKind => STREAM_KINDS[index] ?? 'text'

const voiced = (tuning: Tuning, delta: number, samples: Samples): Tuning =>
  resampled(
    {
      ...tuning,
      kind: kindAt(
        cycle(STREAM_KINDS.indexOf(tuning.kind), delta, STREAM_KINDS.length)
      )
    },
    samples
  )

const sped = (tuning: Tuning, delta: number): Tuning => ({
  ...tuning,
  speedIndex: clamp(tuning.speedIndex + delta, 0, SPEED_STEPS)
})

const tuned = (tuning: Tuning): Step => ({ type: 'tune', tuning })

export const stepped = (tuning: Tuning, key: Key, samples: Samples): Step =>
  match(key)
    .returnType<Step>()
    .with('up', () => tuned(moved(tuning, -1)))
    .with('down', () => tuned(moved(tuning, 1)))
    .with('left', () => tuned(voiced(tuning, -1, samples)))
    .with('right', 'tab', () => tuned(voiced(tuning, 1, samples)))
    .with('enter', () => ({ type: 'close', preset: presetOf(tuning) }))
    .with('escape', () => ({ type: 'close', preset: undefined }))
    .with({ char: 'q' }, () => ({ type: 'close', preset: undefined }))
    .with({ char: 'r' }, () => tuned(resampled(tuning, samples)))
    .with({ char: ' ' }, () => tuned({ ...tuning, paused: !tuning.paused }))
    .with({ char: '[' }, () => tuned(sped(tuning, -1)))
    .with({ char: ']' }, () => tuned(sped(tuning, 1)))
    .otherwise(() => tuned(tuning))

interface Advance {
  readonly tuning: Tuning
  readonly char: string
}

export const advanced = (tuning: Tuning, samples: Samples): Advance => {
  const char = tuning.sample.text[tuning.offset] ?? ''
  const read = {
    ...tuning,
    offset: tuning.offset + 1,
    streamed: `${tuning.streamed}${char}`.slice(-PREVIEW_LIMIT)
  }

  return {
    char,
    tuning: match(read.offset >= read.sample.text.length)
      .with(false, () => read)
      .with(true, () => ({
        ...resampled(read, samples),
        streamed: `${read.streamed}\n`.slice(-PREVIEW_LIMIT)
      }))
      .exhaustive()
  }
}

export interface Delta {
  readonly tuning: Tuning
  readonly text: string
}

export const drained = (
  tuning: Tuning,
  samples: Samples,
  chars: number
): Delta =>
  Array.from({ length: chars }).reduce<Delta>(
    (delta) => {
      const { tuning: read, char } = advanced(delta.tuning, samples)
      return { tuning: read, text: `${delta.text}${char}` }
    },
    { tuning, text: '' }
  )

export const tuningOf = (samples: Samples, saved: PresetName): Tuning => {
  const presetIndex = Math.max(PRESET_NAMES.indexOf(saved), 0)
  return resampled(
    {
      presetIndex,
      config: configFor(saved),
      saved,
      kind: 'text',
      sample: EMPTY_SAMPLE,
      speedIndex: DEFAULT_SPEED_INDEX,
      offset: 0,
      streamed: '',
      paused: false
    },
    samples
  )
}

const clip = (text: string, width: number): string =>
  text.slice(0, Math.max(0, width))

const wrapped = (text: string, width: number): readonly string[] => {
  const limit = Math.max(1, width)
  const rows: string[] = []
  for (const line of text.split('\n')) {
    let rest = line
    while (rest.length > limit) {
      rows.push(rest.slice(0, limit))
      rest = rest.slice(limit)
    }
    rows.push(rest)
  }
  return rows
}

const readingLabel = (reading: ReadingConfig): string =>
  match(reading)
    .with({ kind: 'codepoint' }, ({ span }) => `codepoint ${String(span)}`)
    .with(
      { kind: 'phrase' },
      ({ span }) => `phrase ${String(span)} one per word`
    )
    .otherwise(({ kind }) => kind)

const pitchLabel = (pitch: PitchConfig): string =>
  match(pitch)
    .with(
      { kind: 'scalar' },
      ({ scale, octaves, mapping }) =>
        `scalar ${String(scale.length)} notes ${String(octaves)} oct ${mapping}`
    )
    .with({ kind: 'chromatic' }, ({ span }) => `chromatic ${String(span)}`)
    .with({ kind: 'drone' }, () => 'drone')
    .exhaustive()

const colorLabel = (color: ColorConfig): string =>
  match(color)
    .with({ kind: 'fixed' }, ({ at }) => `fixed ${at.toFixed(2)}`)
    .with({ kind: 'vowel' }, ({ span }) => `${String(span)} vowels`)
    .exhaustive()

const windowOf = (index: number): readonly number[] => {
  const rows = Math.min(PRESET_ROWS, PRESET_NAMES.length)
  const first = clamp(
    index - Math.floor(rows / 2),
    0,
    PRESET_NAMES.length - rows
  )
  return Array.from({ length: rows }, (_, offset) => first + offset)
}

const gutterOf = (tuning: Tuning, index: number): string =>
  match({
    cursor: index === tuning.presetIndex,
    saved: presetAt(index) === tuning.saved
  })
    .with({ cursor: true }, () => '▸')
    .with({ saved: true }, () => '·')
    .otherwise(() => ' ')

const presetRows = (
  tuning: Tuning,
  theme: Theme,
  width: number
): readonly string[] =>
  windowOf(tuning.presetIndex).map((index) => {
    const name = presetAt(index)
    const row = clip(
      `${gutterOf(tuning, index)} ${name.padEnd(NAME_WIDTH)} ${presets[name].description}`,
      width
    )
    return match(index === tuning.presetIndex)
      .with(true, () => theme.bold(theme.fg('accent', row)))
      .with(false, () => theme.fg('dim', row))
      .exhaustive()
  })

const labelled = (theme: Theme, label: string, text: string): string =>
  `${theme.fg('muted', label.padEnd(LABEL_WIDTH))}${theme.fg('text', text)}`

const voiceRow = (tuning: Tuning, theme: Theme): string =>
  `${theme.fg('muted', 'voice'.padEnd(LABEL_WIDTH))}${STREAM_KINDS.map((kind) =>
    match({
      chosen: kind === tuning.kind,
      on: tuning.config.voices[kind].enabled
    })
      .with({ chosen: true, on: true }, () =>
        theme.bold(theme.fg('accent', `[${kind}]`))
      )
      .with({ chosen: true, on: false }, () =>
        theme.bold(theme.fg('warning', `[${kind} off]`))
      )
      .with({ on: false }, () => theme.fg('dim', `${kind} off`))
      .otherwise(() => theme.fg('dim', kind))
  ).join('  ')}`

const sliderRow = (tuning: Tuning, theme: Theme): string => {
  const filled = Math.round((tuning.speedIndex / SPEED_STEPS) * 12)
  // The rate comes off the same clock the producer runs on, so the number
  // cannot drift from what you are hearing.
  const { charsPerSecond } = clockFor(tuning)
  const state = match(tuning.paused)
    .with(true, () => 'paused')
    .with(false, () => 'streaming')
    .exhaustive()
  return labelled(
    theme,
    'speed',
    `slow ${'━'.repeat(filled)}●${'━'.repeat(12 - filled)} fast  ${charsPerSecond.toFixed(1)} chars/s  ${state}`
  )
}

const previewRows = (
  tuning: Tuning,
  theme: Theme,
  width: number
): readonly string[] => {
  const rows = wrapped(tuning.streamed, width).slice(-PREVIEW_ROWS)
  const blanks = Array.from(
    { length: Math.max(0, PREVIEW_ROWS - rows.length) },
    () => ''
  )
  return [...blanks, ...rows].map((row) => theme.fg('toolOutput', row))
}

export const view = (
  tuning: Tuning,
  theme: Theme,
  width: number
): readonly string[] => {
  const voice = voiceOf(tuning)
  const grid = tuning.config.tickHz / voice.divisor
  return [
    theme.bold(theme.fg('accent', clip('blips — pick a preset', width))),
    '',
    ...presetRows(tuning, theme, width),
    '',
    voiceRow(tuning, theme),
    labelled(
      theme,
      'sound',
      `${voice.material} ${voice.touch}  ${String(voice.toneMs)} ms  ${voice.baseFrequency.toFixed(2)} Hz  swell ${voice.swell.toFixed(2)}  hold ${voice.hold.toFixed(2)}  glide ${voice.glide.toFixed(1)}st`
    ),
    labelled(
      theme,
      'grid',
      `${tuning.config.tickHz.toFixed(1)} Hz / ${String(voice.divisor)} = ${grid.toFixed(1)} blips/s  stride ${String(voice.stride)}  ring ${(voice.toneMs / (1000 / grid)).toFixed(2)}`
    ),
    labelled(
      theme,
      'read',
      `${readingLabel(voice.reading)} -> ${pitchLabel(voice.pitch)}  colour ${colorLabel(voice.color)}`
    ),
    sliderRow(tuning, theme),
    theme.fg('borderMuted', '─'.repeat(Math.max(1, width))),
    ...previewRows(tuning, theme, width),
    theme.fg(
      'dim',
      clip(
        '↑↓ preset   ←→ voice   r sample   [ ] speed   space pause   enter keep   esc cancel',
        width
      )
    )
  ]
}

export interface Surface {
  readonly custom: <T>(
    factory: (
      tui: { requestRender: () => void },
      theme: Theme,
      keybindings: unknown,
      done: (result: T) => void
    ) => Component
  ) => Promise<T>
}

interface Component {
  readonly render: (width: number) => readonly string[]
  readonly handleInput: (data: string) => void
  readonly dispose: () => void
}

interface Open {
  readonly tuning: Tuning
  readonly samples: Samples
}

export interface Tuner {
  /** The audition, on a grid of its own so the preset's tempo is heard. */
  readonly audition: Observable<PlayCommand>
  /** Open dialogs hold the audio device open, whatever the config says. */
  readonly active: Observable<boolean>
  /** Resolves with the preset to keep, or nothing when the user backed out. */
  readonly open: (surface: Surface) => Promise<PresetName | undefined>
}

const nothing = (): undefined => undefined

export const createTuner = (): Tuner => {
  const state = new BehaviorSubject<Open | undefined>(undefined)

  const active = state.pipe(
    map((open) => open !== undefined),
    distinctUntilChanged()
  )

  const voicing = state.pipe(
    map((open) =>
      match(open)
        .with(P.nullish, (): Voicing => ({ voice: undefined }))
        .otherwise(({ tuning }) => voicingFor(tuning))
    ),
    distinctUntilChanged((left, right) => left.voice === right.voice)
  )

  const tickHz = state.pipe(
    map((open) => open?.tuning.config.tickHz ?? 0),
    filter((hz) => hz > 0),
    distinctUntilChanged()
  )

  const spend = ({ chars }: Arrival): string =>
    match(state.getValue())
      .with(P.nullish, () => '')
      .otherwise((open) => {
        const { tuning, text } = drained(open.tuning, open.samples, chars)
        state.next({ ...open, tuning })
        return text
      })

  const deltas = state.pipe(
    map((open) =>
      match(open)
        .with(P.nullish, (): Clock => ({ paused: true, charsPerSecond: 0 }))
        .otherwise(({ tuning }) => clockFor(tuning))
    ),
    distinctUntilChanged(sameClock),
    switchMap((clock) =>
      match(clock.paused)
        .with(true, () => EMPTY)
        .with(false, () =>
          defer(() => {
            const arrival = arrivalOf(clock.charsPerSecond, Math.random)
            return timer(arrival.waitMs).pipe(map(() => arrival))
          }).pipe(repeat())
        )
        .exhaustive()
    ),
    map(spend),
    filter((text) => text.length > 0)
  )

  const audition = active.pipe(
    switchMap((open) =>
      match(open)
        .with(false, () => EMPTY)
        .with(true, () => deltas.pipe(tonesFrom(voicing, gridFrom(tickHz))))
        .exhaustive()
    ),
    map(({ tone, at }) => play(tone, at))
  )

  const component = (
    theme: Theme,
    repaint: () => void,
    done: (preset: PresetName | undefined) => void
  ): Component => {
    const watch = state.subscribe(repaint)

    const apply = (step: Step, open: Open): void => {
      match(step)
        .with({ type: 'tune' }, ({ tuning }) => {
          state.next({ ...open, tuning })
        })
        .with({ type: 'close' }, ({ preset }) => {
          done(preset)
        })
        .exhaustive()
    }

    return {
      render: (width) =>
        match(state.getValue())
          .with(P.nullish, (): readonly string[] => [])
          .otherwise(({ tuning }) => view(tuning, theme, width)),
      handleInput: (data) => {
        match({ key: keyOf(data), open: state.getValue() })
          .with(
            { key: P.nonNullable, open: P.nonNullable },
            ({ key, open }) => {
              apply(stepped(open.tuning, key, open.samples), open)
            }
          )
          .otherwise(nothing)
      },
      dispose: () => {
        watch.unsubscribe()
      }
    }
  }

  return {
    audition,
    active,
    open: async (surface) => {
      const samples = await loadSamples()
      const { preset } = loadSettings()
      state.next({ samples, tuning: tuningOf(samples, preset) })

      try {
        return await surface.custom<PresetName | undefined>(
          (tui, theme, _keybindings, done) =>
            component(theme, () => tui.requestRender(), done)
        )
      } finally {
        state.next(undefined)
      }
    }
  }
}
