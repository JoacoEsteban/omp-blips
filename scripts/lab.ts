import { parseAnsiToSurface } from '@flyingrobots/bijou'
import { chalkStyle, startApp } from '@flyingrobots/bijou-node'
import { isKeyMsg, quit, type App, type Cmd } from '@flyingrobots/bijou-tui'
import { generate, render } from 'esfuzz'
import { loremIpsum } from 'lorem-ipsum'
import {
  BehaviorSubject,
  distinctUntilChanged,
  EMPTY,
  interval,
  map,
  type Observable,
  of,
  share,
  Subject,
  switchMap
} from 'rxjs'
import { match } from 'ts-pattern'
import type { BlipConfig, VoiceConfig } from '../src/config.ts'
import { play } from '../src/player.ts'
import { ffplay } from '../src/players/ffplay.ts'
import { type PresetName, PRESET_NAMES, presets } from '../src/presets.ts'
import { loadSettings } from '../src/settings.ts'
import { tonesFrom, type Voicing } from '../src/stream.ts'
import type { Material } from '../src/synth.ts'

const DEFAULT_STREAM_DELAY_MS = 10
const MIN_STREAM_DELAY_MS = 1
const MAX_STREAM_DELAY_MS = 1_000
const STREAM_SPEED_JUMPS = 50
const DEFAULT_WIDTH = 100
const DEFAULT_HEIGHT = 24
const CALL_GENERATION_ATTEMPTS = 8
const MATERIALS: readonly Material[] = ['wood', 'stone', 'ceramic', 'glass']

const style = chalkStyle()
const accent = (text: string): string => style.bold(style.hex('#22d3ee', text))
const selected = (text: string): string =>
  style.bold(style.hex('#fbbf24', `[${text}]`))
const muted = (text: string): string => style.hex('#64748b', text)

type StreamMode = 'prose' | 'call'

interface Model {
  readonly width: number
  readonly height: number
  readonly presetIndex: number
  readonly materialIndex: number
  readonly config: BlipConfig
  readonly mode: StreamMode
  readonly proseSample: string
  readonly callSample: string
  readonly callError: string
  readonly streamSpeedIndex: number
  readonly streamOffset: number
  readonly streamed: string
  readonly paused: boolean
}

type Msg = { readonly type: 'stream-character' }

/** How fast characters leave the sample, and whether they leave at all. */
interface Clock {
  readonly paused: boolean
  readonly delayMs: number
}

/**
 * Every effect of the lab, as one running graph: a clock that produces
 * characters, and the blip pipeline of the extension behind a live `ffplay`.
 * The application below stays a pure `[model, commands]` fold on top of it.
 */
interface Lab {
  /** One message per character, at the current speed. */
  readonly ticks: Observable<Msg>
  readonly setClock: (clock: Clock) => void
  /** Change the voice. The blip count starts again from zero. */
  readonly setVoicing: (voicing: Voicing) => void
  readonly emit: (char: string) => void
  readonly stop: () => void
}

const createLab = (initial: Voicing): Lab => {
  const clock = new BehaviorSubject<Clock>({
    paused: false,
    delayMs: DEFAULT_STREAM_DELAY_MS
  })
  const voicing = new BehaviorSubject<Voicing>(initial)
  const characters = new Subject<string>()

  const ticks = clock.pipe(
    distinctUntilChanged(
      (left, right) =>
        left.paused === right.paused && left.delayMs === right.delayMs
    ),
    switchMap((current) =>
      match(current.paused)
        .with(true, () => EMPTY)
        .with(false, () => interval(current.delayMs))
        .exhaustive()
    ),
    map((): Msg => ({ type: 'stream-character' }))
  )

  const commands = voicing.pipe(
    switchMap((current) => characters.pipe(tonesFrom(of(current)))),
    map(({ tone }) => play(tone)),
    share({
      resetOnRefCountZero: false,
      resetOnComplete: false,
      resetOnError: false
    })
  )

  // The lab keeps its device for the whole session: a pause is silence, not a
  // reason to give the process back.
  const audio = ffplay({ idleMs: Number.POSITIVE_INFINITY })(
    commands
  ).subscribe()

  return {
    ticks,
    setClock: (next) => clock.next(next),
    setVoicing: (next) => voicing.next(next),
    emit: (char) => characters.next(char),
    stop: () => {
      audio.unsubscribe()
      characters.complete()
      voicing.complete()
      clock.complete()
    }
  }
}

interface GeneratedCall {
  readonly sample: string
  readonly error: string
}

const configFor = (preset: PresetName, material: Material): BlipConfig => {
  const { config } = loadSettings(process.cwd(), preset)
  return {
    ...config,
    voices: {
      ...config.voices,
      text: { ...config.voices.text, material },
      tool: { ...config.voices.tool, material }
    }
  }
}

const generateProseSample = (): string =>
  loremIpsum({ count: 3, units: 'paragraphs' })

const generateCallSample = (previous: string): GeneratedCall => {
  for (let attempt = 0; attempt < CALL_GENERATION_ATTEMPTS; attempt += 1) {
    const sample = render(generate({ maxDepth: 8 }))
    if (sample.trim().length > 0) return { sample, error: '' }
  }
  return {
    sample: previous,
    error: `Unable to generate a non-empty JavaScript sample after ${String(CALL_GENERATION_ATTEMPTS)} attempts.`
  }
}

const cycle = (current: number, delta: number, length: number): number =>
  (current + delta + length) % length

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

const streamDelayMs = (speedIndex: number): number =>
  Math.ceil(
    MAX_STREAM_DELAY_MS *
      (MIN_STREAM_DELAY_MS / MAX_STREAM_DELAY_MS) **
        (clamp(speedIndex, 0, STREAM_SPEED_JUMPS) / STREAM_SPEED_JUMPS)
  )

const speedIndexForDelay = (delayMs: number): number =>
  Math.round(
    (Math.log(delayMs / MAX_STREAM_DELAY_MS) /
      Math.log(MIN_STREAM_DELAY_MS / MAX_STREAM_DELAY_MS)) *
      STREAM_SPEED_JUMPS
  )

const DEFAULT_STREAM_SPEED_INDEX = speedIndexForDelay(DEFAULT_STREAM_DELAY_MS)

/** Bridge a stream of messages into the application loop for as long as it runs. */
const listen =
  (source: Observable<Msg>): Cmd<Msg> =>
  (emit) => {
    const subscription = source.subscribe((msg) => {
      emit(msg)
    })
    return () => {
      subscription.unsubscribe()
    }
  }

/** A command that only touches the running graph. */
const effect =
  (run: () => void): Cmd<Msg> =>
  () => {
    run()
    return undefined
  }

const sampleFor = (model: Model): string =>
  match(model.mode)
    .with('prose', () => model.proseSample)
    .with('call', () => model.callSample)
    .exhaustive()

const voiceFor = (model: Model): VoiceConfig =>
  match(model.mode)
    .with('prose', () => model.config.voices.text)
    .with('call', () => model.config.voices.tool)
    .exhaustive()

const voicingFor = (model: Model): Voicing => {
  const voice = voiceFor(model)
  return {
    voice: match(voice.enabled)
      .with(true, () => voice)
      .with(false, () => undefined)
      .exhaustive(),
    minIntervalMs: model.config.minIntervalMs
  }
}

/** Nothing to read, or nothing to read from: either way the clock stops. */
const clockFor = (model: Model): Clock => ({
  paused:
    model.paused ||
    sampleFor(model).length === 0 ||
    (model.mode === 'call' && model.callError.length > 0),
  delayMs: streamDelayMs(model.streamSpeedIndex)
})

/** Hand the model's clock to the graph. Every update ends in one of these. */
const timed = (lab: Lab, model: Model): [Model, Cmd<Msg>[]] => [
  model,
  [effect(() => lab.setClock(clockFor(model)))]
]

/** The voice changed: retune the graph and start a fresh blip count. */
const tuned = (lab: Lab, model: Model): [Model, Cmd<Msg>[]] => [
  model,
  [
    effect(() => lab.setVoicing(voicingFor(model))),
    effect(() => lab.setClock(clockFor(model)))
  ]
]

const wrapPreview = (text: string, width: number): string[] => {
  const lineWidth = Math.max(1, width)
  const lines: string[] = []
  for (const line of text.split('\n')) {
    if (line.length === 0) {
      lines.push('')
      continue
    }
    let remaining = line
    while (remaining.length > lineWidth) {
      lines.push(remaining.slice(0, lineWidth))
      remaining = remaining.slice(lineWidth)
    }
    lines.push(remaining)
  }
  return lines
}

const choiceLine = <Value extends string>(
  label: string,
  values: readonly Value[],
  active: number
): string =>
  `${accent(label.padEnd(10))}${values
    .map((value, index) =>
      match(index === active)
        .with(true, () => selected(value))
        .with(false, () => muted(value))
        .exhaustive()
    )
    .join('  ')}`

const speedSlider = (speedIndex: number): string => {
  const filled = Math.round((speedIndex / STREAM_SPEED_JUMPS) * 12)
  return `${accent('speed'.padEnd(10))}${muted('slow 1000 ms')} ${selected(`${'━'.repeat(filled)}●${'━'.repeat(12 - filled)}`)} ${muted('1 ms fast')}  ${String(streamDelayMs(speedIndex))} ms`
}

const modeIndex = (mode: StreamMode): number =>
  match(mode)
    .with('prose', () => 0)
    .with('call', () => 1)
    .exhaustive()

const previewFor = (model: Model): string[] =>
  match(model.streamed.length > 0)
    .with(true, () => wrapPreview(model.streamed, model.width))
    .with(false, () => [muted('waiting for text…')])
    .exhaustive()

/** The sample ran out: start the next one, keeping the preview continuous. */
const restarted = (model: Model, previewLimit: number): Model =>
  match(model.mode)
    .with('prose', () => ({
      ...model,
      proseSample: generateProseSample(),
      streamOffset: 0,
      streamed: `${model.streamed}\n`.slice(-previewLimit)
    }))
    .with('call', () => {
      const call = generateCallSample(model.callSample)
      return match(call.error.length > 0)
        .with(true, () => ({ ...model, callError: call.error }))
        .with(false, () => ({
          ...model,
          callSample: call.sample,
          callError: '',
          streamOffset: 0,
          streamed: `${model.streamed}\n`.slice(-previewLimit)
        }))
        .exhaustive()
    })
    .exhaustive()

const withPreset = (model: Model, delta: number): Model => {
  const presetIndex = cycle(model.presetIndex, delta, PRESET_NAMES.length)
  const preset = PRESET_NAMES[presetIndex] ?? 'default'
  const material = MATERIALS[model.materialIndex] ?? 'ceramic'
  return { ...model, presetIndex, config: configFor(preset, material) }
}

const withMaterial = (model: Model, delta: number): Model => {
  const materialIndex = cycle(model.materialIndex, delta, MATERIALS.length)
  const preset = PRESET_NAMES[model.presetIndex] ?? 'default'
  const material = MATERIALS[materialIndex] ?? 'ceramic'
  return { ...model, materialIndex, config: configFor(preset, material) }
}

const rewound = (model: Model): Model => ({
  ...model,
  streamOffset: 0,
  streamed: ''
})

const createLabApp = (
  lab: Lab,
  initialConfig: BlipConfig
): App<Model, Msg> => ({
  init: () => {
    const call = generateCallSample('')
    const model: Model = {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      presetIndex: 0,
      materialIndex: MATERIALS.indexOf(initialConfig.voices.text.material),
      config: initialConfig,
      mode: 'prose',
      proseSample: generateProseSample(),
      callSample: call.sample,
      callError: call.error,
      streamSpeedIndex: DEFAULT_STREAM_SPEED_INDEX,
      streamOffset: 0,
      streamed: '',
      paused: false
    }
    const [tunedModel, commands] = tuned(lab, model)
    return [tunedModel, [listen(lab.ticks), ...commands]]
  },

  update: (msg, model) =>
    match(msg)
      .when(isKeyMsg, (key): [Model, Cmd<Msg>[]] =>
        match(key)
          .returnType<[Model, Cmd<Msg>[]]>()
          .with({ ctrl: true, key: 'c' }, () => [model, [quit<Msg>()]])
          .with({ key: 'q' }, () => [model, [quit<Msg>()]])
          .with({ key: 'space' }, () =>
            timed(lab, { ...model, paused: !model.paused })
          )
          .with({ key: 'tab' }, () =>
            tuned(
              lab,
              rewound({
                ...model,
                mode: match(model.mode)
                  .with('prose', () => 'call' as const)
                  .with('call', () => 'prose' as const)
                  .exhaustive()
              })
            )
          )
          .with({ key: 'r' }, () =>
            tuned(
              lab,
              rewound(
                match(model.mode)
                  .with('prose', () => ({
                    ...model,
                    proseSample: generateProseSample()
                  }))
                  .with('call', () => {
                    const call = generateCallSample(model.callSample)
                    return {
                      ...model,
                      callSample: call.sample,
                      callError: call.error
                    }
                  })
                  .exhaustive()
              )
            )
          )
          .with({ key: '[' }, () =>
            timed(lab, {
              ...model,
              streamSpeedIndex: clamp(
                model.streamSpeedIndex - 1,
                0,
                STREAM_SPEED_JUMPS
              )
            })
          )
          .with({ key: ']' }, () =>
            timed(lab, {
              ...model,
              streamSpeedIndex: clamp(
                model.streamSpeedIndex + 1,
                0,
                STREAM_SPEED_JUMPS
              )
            })
          )
          .with({ key: 'left' }, () => tuned(lab, withPreset(model, -1)))
          .with({ key: 'right' }, () => tuned(lab, withPreset(model, 1)))
          .with({ key: 'up' }, () => tuned(lab, withMaterial(model, -1)))
          .with({ key: 'down' }, () => tuned(lab, withMaterial(model, 1)))
          .otherwise(() => [model, []])
      )
      .with({ type: 'resize' }, (resize): [Model, Cmd<Msg>[]] => [
        { ...model, width: resize.columns, height: resize.rows },
        []
      ])
      .with({ type: 'stream-character' }, (): [Model, Cmd<Msg>[]] => {
        const sample = sampleFor(model)
        if (sample.length === 0) return timed(lab, model)

        const char = sample[model.streamOffset] ?? ''
        const previewLimit = Math.max(1, model.width * model.height * 2)
        const advanced = {
          ...model,
          streamed: `${model.streamed}${char}`.slice(-previewLimit),
          streamOffset: model.streamOffset + 1
        }
        const next = match(advanced.streamOffset >= sample.length)
          .with(false, () => advanced)
          .with(true, () => restarted(advanced, previewLimit))
          .exhaustive()

        const [timedModel, commands] = timed(lab, next)
        return [timedModel, [effect(() => lab.emit(char)), ...commands]]
      })
      .otherwise((): [Model, Cmd<Msg>[]] => [model, []]),

  view: (model) => {
    const preset = PRESET_NAMES[model.presetIndex] ?? 'default'
    const voice = voiceFor(model)
    const status = match(model.paused)
      .with(true, () => selected('paused'))
      .with(false, () => accent('streaming'))
      .exhaustive()
    const divider = muted('─'.repeat(Math.max(1, model.width)))
    const header = [
      accent('BLIPS SOUND LAB'),
      divider,
      choiceLine('mode', ['prose', 'call'] as const, modeIndex(model.mode)),
      choiceLine('preset', PRESET_NAMES, model.presetIndex),
      choiceLine('material', MATERIALS, model.materialIndex),
      '',
      `${accent('sound')}  ${voice.touch} touch  ${String(voice.toneMs)} ms  ${voice.baseFrequency.toFixed(2)} Hz  every ${String(voice.charsPerBlip)} chars`,
      `${accent('preset')} ${presets[preset].description}`,
      speedSlider(model.streamSpeedIndex),
      `${accent('stream')} ${model.mode} ${status}`
    ]
    if (model.callError.length > 0)
      header.push(muted(`call error: ${model.callError}`))
    const preview = previewFor(model)

    const footerText =
      'tab mode   r regenerate   ←/→ preset   ↑/↓ material   [ / ] speed   space pause   q quit'
    const footer = wrapPreview(footerText, model.width).map((line) =>
      muted(line)
    )
    const availablePreviewHeight = Math.max(
      1,
      model.height - header.length - footer.length
    )
    const visiblePreview = preview.slice(-availablePreviewHeight)
    const screen = [...header, ...visiblePreview, ...footer].join('\n')
    return parseAnsiToSurface(screen, model.width, model.height)
  }
})

const initialMaterial: Material = 'ceramic'
const initialConfig = configFor('default', initialMaterial)
const lab = createLab({
  voice: initialConfig.voices.text,
  minIntervalMs: initialConfig.minIntervalMs
})

try {
  await startApp(createLabApp(lab, initialConfig))
} finally {
  lab.stop()
}
