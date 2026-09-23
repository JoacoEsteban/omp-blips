import { spawn } from 'node:child_process'
import {
  concat,
  defer,
  endWith,
  exhaustMap,
  filter,
  finalize,
  fromEvent,
  ignoreElements,
  interval,
  map,
  merge,
  type Observable,
  of,
  scan,
  take,
  takeUntil,
  takeWhile,
  tap
} from 'rxjs'
import { match } from 'ts-pattern'
import { SAMPLE_RATE } from '../synth.ts'
import {
  mixerStep,
  openMixer,
  TICK_MS,
  type MixerEvent,
  type MixerState
} from './mixer.ts'
import type { Backend, PlayCommand } from './types.ts'

/** Tear the device down after this much silence; the next tone opens a new one. */
const IDLE_MS = 20_000

const FFPLAY_ARGS = [
  '-hide_banner',
  '-loglevel',
  'quiet',
  '-nodisp',
  '-autoexit',
  '-fflags',
  'nobuffer',
  '-flags',
  'low_delay',
  '-probesize',
  '32',
  '-analyzeduration',
  '0',
  '-f',
  's16le',
  '-ar',
  String(SAMPLE_RATE),
  '-ch_layout',
  'mono',
  '-i',
  'pipe:0'
]

export interface FfplayOptions {
  /** Silence before the device closes. `Infinity` keeps it for the whole subscription. */
  readonly idleMs?: number
}

interface Device {
  readonly write: (block: Buffer) => void
  /** Emits once when the process leaves on its own. */
  readonly closed: Observable<unknown>
  readonly close: () => void
}

/** Spawn `ffplay` reading raw PCM from its standard input. */
const openDevice = (): Device => {
  const child = spawn('ffplay', FFPLAY_ARGS, {
    stdio: ['pipe', 'ignore', 'ignore']
  })
  // A device that dies mid-write is a closed device, not a crash.
  child.stdin?.on('error', () => {})

  return {
    write: (block) => {
      child.stdin?.write(block)
    },
    closed: merge(fromEvent(child, 'exit'), fromEvent(child, 'error')).pipe(
      take(1)
    ),
    close: () => {
      child.stdin?.end()
      child.kill('SIGTERM')
    }
  }
}

const asMixerEvent = (command: PlayCommand): MixerEvent =>
  match(command)
    .with({ type: 'play' }, ({ tone }): MixerEvent => ({
      type: 'play',
      tone,
      at: performance.now()
    }))
    .with({ type: 'flush' }, (): MixerEvent => ({ type: 'flush' }))
    .exhaustive()

/**
 * The mix as a stream of PCM blocks: commands and a 10 ms clock fold into the
 * mixer state, and every state that produced audio hands its block on. The
 * stream ends when nothing rings and no further command can arrive.
 */
const blocks = (
  idleMs: number,
  commands: Observable<PlayCommand>
): Observable<Buffer> =>
  defer(() => {
    const opened: MixerState = openMixer(performance.now())

    return merge(
      commands.pipe(map(asMixerEvent), endWith<MixerEvent>({ type: 'end' })),
      interval(TICK_MS).pipe(
        map((): MixerEvent => ({ type: 'tick', at: performance.now() }))
      )
    ).pipe(
      scan(mixerStep(idleMs), opened),
      takeWhile((state) => !state.done),
      map((state) => state.block),
      filter((block): block is Buffer => block !== undefined)
    )
  })

/** One open device for as long as there is audio to write to it. */
const session = (
  idleMs: number,
  commands: Observable<PlayCommand>
): Observable<never> =>
  defer(() => {
    const device = openDevice()

    return blocks(idleMs, commands).pipe(
      tap((block) => {
        device.write(block)
      }),
      takeUntil(device.closed),
      finalize(device.close),
      ignoreElements()
    )
  })

/**
 * One long-lived `ffplay` reading raw PCM from stdin. The mixer writes a
 * continuous real-time stream, so tones start on the next 10 ms tick instead of
 * waiting for a process spawn, and overlapping tones are summed into one buffer
 * rather than racing separate processes.
 *
 * The first tone opens the device; `exhaustMap` keeps that one session for
 * every command that follows, and the next tone after an idle close opens
 * another.
 */
export const ffplay =
  ({ idleMs = IDLE_MS }: FfplayOptions = {}): Backend =>
  (commands) =>
    commands.pipe(
      filter((command) => command.type === 'play'),
      exhaustMap((first) => session(idleMs, concat(of(first), commands)))
    )
