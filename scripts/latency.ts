/**
 * Usage: bun run scripts/latency.ts
 *
 * Plays clicks through the extension's own playback path to the default
 * output, records them with the built-in microphone, and prints how long each
 * one took from the moment it was scheduled to the moment the mic heard it.
 * Put the headphones next to the microphone before running.
 */
import { spawn } from 'node:child_process'
import {
  concat,
  ignoreElements,
  lastValueFrom,
  map,
  of,
  take,
  tap,
  timer
} from 'rxjs'
import { isMatching, match, P } from 'ts-pattern'
import { play, playback, type Tone } from '../src/player.ts'
import { FfplayLocator } from '../src/players/locate.ts'

// The AirPods mic is usually the default input, and opening it drops their
// output from A2DP to the hands-free profile, which is a different latency.
const MIC = 'MacBook Pro Microphone'
const MIC_RATE = 48_000
const CLICKS = 12
// Far longer than any Bluetooth path, so each click has its own window.
const GAP_MS = 1000
const WARMUP_MS = 1500
const WINDOW_MS = 800
// A click must stand this far above the room to count as heard.
const OVER_NOISE = 8
const MIN_THRESHOLD = 200

const click: Tone = {
  frequency: 2400,
  toneMs: 25,
  decay: 1,
  swell: 0,
  hold: 0,
  glide: 0,
  color: 0,
  material: 'wood',
  touch: 'firm',
  volume: 1,
  spatial: { at: 0 }
}

interface Recording {
  readonly samples: Buffer
  /** `performance.now()` of the first sample. */
  readonly originMs: number
  /** The mic's real rate. avfoundation can deliver far from the nominal one. */
  readonly framesPerMs: number
}

interface Arrival {
  readonly frames: number
  readonly at: number
}

/**
 * The rate is read off the arrivals, skipping the first second while the
 * device settles. Every chunk then says its last sample existed no later than
 * its arrival, so the earliest such bound is the origin with the delivery
 * jitter taken out. What is left is the mic's fixed input delay, which makes
 * every reading a few milliseconds long.
 */
const recordingOf = (
  samples: Buffer,
  arrivals: readonly Arrival[]
): Recording => {
  const first = arrivals[0] ?? { frames: 0, at: 0 }
  const settled = arrivals.find(({ at }) => at - first.at > 1000) ?? first
  const last = arrivals.at(-1) ?? first
  const framesPerMs =
    (last.frames - settled.frames) / Math.max(1, last.at - settled.at)

  return {
    samples,
    framesPerMs,
    originMs: Math.min(
      ...arrivals.map(({ frames, at }) => at - frames / framesPerMs)
    )
  }
}

const recorder = (): { readonly stop: () => Promise<Recording> } => {
  const child = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'avfoundation',
      '-i',
      `:${MIC}`,
      '-ac',
      '1',
      '-ar',
      String(MIC_RATE),
      '-flush_packets',
      '1',
      '-f',
      's16le',
      'pipe:1'
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] }
  )
  const chunks: Buffer[] = []
  const arrivals: Arrival[] = []
  let bytes = 0

  child.stdout.on('data', (chunk: Buffer) => {
    bytes += chunk.length
    chunks.push(chunk)
    arrivals.push({ frames: bytes / 2, at: performance.now() })
  })

  return {
    stop: () => {
      const { promise, resolve } = Promise.withResolvers<Recording>()
      child.on('close', () => {
        resolve(recordingOf(Buffer.concat(chunks), arrivals))
      })
      child.stdin.end('q')
      return promise
    }
  }
}

const sampleAt = ({ samples }: Recording, index: number): number =>
  match(index)
    .with(P.number.between(0, samples.length / 2 - 1), (inside) =>
      samples.readInt16LE(inside * 2)
    )
    .otherwise(() => 0)

const indexOf = ({ originMs, framesPerMs }: Recording, ms: number): number =>
  Math.round((ms - originMs) * framesPerMs)

const rms = (recording: Recording, from: number, to: number): number => {
  const span = Array.from({ length: Math.max(0, to - from) }, (_, offset) =>
    sampleAt(recording, from + offset)
  )
  return Math.sqrt(
    span.reduce((sum, sample) => sum + sample * sample, 0) /
      Math.max(1, span.length)
  )
}

const heard = (recording: Recording, at: number): number | undefined => {
  const from = indexOf(recording, at)
  const to = Math.min(
    indexOf(recording, at + WINDOW_MS),
    recording.samples.length / 2
  )
  const threshold = Math.max(
    rms(recording, indexOf(recording, at - 300), indexOf(recording, at - 50)) *
      OVER_NOISE,
    MIN_THRESHOLD
  )
  const onset = Array.from(
    { length: Math.max(0, to - from) },
    (_, offset) => from + offset
  ).find((index) => Math.abs(sampleAt(recording, index)) > threshold)

  return match(onset)
    .with(
      P.number,
      (index) => recording.originMs + index / recording.framesPerMs - at
    )
    .otherwise(() => undefined)
}

const outputDevice = async (): Promise<string> => {
  const report: unknown = await new Response(
    Bun.spawn(['system_profiler', 'SPAudioDataType', '-json']).stdout
  ).json()
  const isDefaultOutput = isMatching({
    _name: P.string,
    coreaudio_default_audio_output_device: 'spaudio_yes'
  })

  return match(report)
    .with({ SPAudioDataType: [{ _items: P.array(P.select()) }] }, (items) =>
      match(items.find(isDefaultOutput))
        .with({ _name: P.select() }, (name) => name)
        .otherwise(() => 'unknown output')
    )
    .otherwise(() => 'unknown output')
}

const median = (values: readonly number[]): number | undefined =>
  values.toSorted((left, right) => left - right)[Math.floor(values.length / 2)]

const ms = (value: number | undefined): string =>
  match(value)
    .with(P.number, (known) => `${Math.round(known)} ms`.padStart(7))
    .otherwise(() => ' missed')

const device = await outputDevice()
const scheduled: number[] = []
const recording = recorder()

await lastValueFrom(
  playback(
    of({ muted: false }),
    concat(
      timer(WARMUP_MS, GAP_MS).pipe(
        take(CLICKS),
        map(() => performance.now()),
        tap((at) => scheduled.push(at)),
        map((at) => play(click, at))
      ),
      timer(WINDOW_MS).pipe(ignoreElements())
    ),
    new FfplayLocator().path
  ),
  { defaultValue: undefined }
)

const captured = await recording.stop()
const latencies = scheduled.map((at) => heard(captured, at))
const steady = latencies
  .slice(1)
  .filter((latency): latency is number => latency !== undefined)

const recordedMs = captured.samples.length / 2 / captured.framesPerMs
console.log(`output: ${device}`)
console.log(
  `mic rate ${Math.round(captured.framesPerMs * 1000)} Hz, recorded ${ms(captured.originMs - (scheduled[0] ?? 0))} .. ${ms(captured.originMs + recordedMs - (scheduled[0] ?? 0))} around the first click`
)
latencies.forEach((latency, index) => {
  const label = match(index)
    .with(0, () => 'cold')
    .otherwise(() => '')
  console.log(`click ${String(index + 1).padStart(2)} ${ms(latency)} ${label}`)
})
console.log(
  `steady: median ${ms(median(steady))}, min ${ms(Math.min(...steady))}, max ${ms(Math.max(...steady))}, heard ${steady.length}/${CLICKS - 1}`
)
