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
import { match, P } from 'ts-pattern'
import { SAMPLE_RATE } from '../synth.ts'
import {
  FRAME_BYTES,
  LEAD_MS,
  mixerStep,
  openMixer,
  releaseMixer,
  TICK_MS,
  type MixerEvent,
  type MixerState
} from './mixer.ts'
import type { Backend, Sent } from './types.ts'

/** Tear the device down after this much silence; the next tone opens a new one. */
const IDLE_MS = 20_000
/** Master fade is short enough not to hold mute/shutdown observably. */
const MASTER_FADE_MS = 6

/**
 * ffmpeg's raw PCM reader hands over 100 ms packets and waits for each to
 * fill, which the mixer's lead cannot beat. The WAV reader takes a packet
 * size, so the stream is a WAV of one tick per packet. It is float because
 * that reader probes 16-bit PCM for S/PDIF first, which blocks on a pipe until
 * 64 KiB arrive. `info` is the lowest level that prints the status line the
 * clock is read from.
 */
const FFPLAY_ARGS = [
  '-hide_banner',
  '-loglevel',
  'info',
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
  'wav',
  '-max_size',
  String(Math.round((TICK_MS * SAMPLE_RATE) / 1000) * FRAME_BYTES),
  '-i',
  'pipe:0'
]

/** The sizes are the streaming "unknown length" maximum. */
const wavHeader = (): Buffer => {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(0xffffffff, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  // 3 is IEEE float.
  header.writeUInt16LE(3, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * FRAME_BYTES, 28)
  header.writeUInt16LE(FRAME_BYTES, 32)
  header.writeUInt16LE(32, 34)
  header.write('data', 36)
  header.writeUInt32LE(0xffffffff, 40)
  return header
}

/** ffplay's status line leads with its playback clock in seconds, or `nan` before it plays. */
const heardMsOf = (status: string): number | undefined =>
  match(/(-?\d+\.\d+) M-A/.exec(status))
    .with([P._, P.string.select()], (seconds) => Number(seconds) * 1000)
    .otherwise(() => undefined)

interface Heard {
  readonly at: number
  readonly heardMs: number
}

export interface FfplayOptions {
  readonly path: string
  /** Silence before the device closes. `Infinity` keeps it for the whole subscription. */
  readonly idleMs?: number
}

interface Device {
  readonly write: (block: Buffer) => void
  /** Emits once when the process leaves on its own. */
  readonly closed: Observable<unknown>
  /** Emits once, when the device first reports what it is playing. */
  readonly heard: Observable<Heard>
  readonly close: () => void
}

const openDevice = (path: string): Device => {
  const child = spawn(path, FFPLAY_ARGS, {
    stdio: ['pipe', 'ignore', 'pipe']
  })
  // A device that dies mid-write is a closed device, not a crash.
  child.stdin.on('error', () => {})
  child.stdin.write(wavHeader())
  // ffplay blocks once an unread stderr fills, so what the sync does not read is dropped.
  child.stderr.resume()

  let closeTimer: NodeJS.Timeout | undefined
  let closed = false
  const cleanup = (): void => {
    closed = true
    clearTimeout(closeTimer)
    closeTimer = undefined
  }
  const terminated = (): void => {
    clearTimeout(closeTimer)
    closeTimer = undefined
    child.kill('SIGTERM')
  }
  child.once('exit', cleanup)
  child.once('error', cleanup)
  const ended = merge(fromEvent(child, 'exit'), fromEvent(child, 'error')).pipe(
    take(1)
  )
  const heard = fromEvent(child.stderr, 'data').pipe(
    map((chunk) => ({
      at: performance.now(),
      heardMs: heardMsOf(String(chunk))
    })),
    filter((reading): reading is Heard => reading.heardMs !== undefined),
    take(1)
  )

  return {
    write: (block) => {
      child.stdin.write(block)
    },
    closed: ended,
    heard,
    close: () => {
      if (closed) return
      child.stdin.end()
      closeTimer = setTimeout(terminated, LEAD_MS + MASTER_FADE_MS + 10)
    }
  }
}

/**
 * Everything written while ffplay opens its audio device queues ahead of the
 * first sample it plays, and that backlog would delay every tone after it.
 * The first sync moves the mixer onto the device's own timeline, so it writes
 * nothing until the device has played the backlog down to the lead.
 */
const blocks = (
  idleMs: number,
  commands: Observable<Sent>,
  heard: Observable<Heard>
): Observable<MixerState> =>
  defer(() => {
    const opened: MixerState = openMixer(performance.now())

    return merge(
      commands.pipe(endWith<MixerEvent>({ type: 'end' })),
      heard.pipe(
        map(({ at, heardMs }): MixerEvent => ({ type: 'sync', at, heardMs }))
      ),
      interval(TICK_MS).pipe(
        map((): MixerEvent => ({ type: 'tick', at: performance.now() }))
      )
    ).pipe(
      scan(mixerStep(idleMs), opened),
      takeWhile((state) => !state.done)
    )
  })

const session = (
  path: string,
  idleMs: number,
  commands: Observable<Sent>
): Observable<never> =>
  defer(() => {
    const device = openDevice(path)
    let latest: MixerState | undefined

    return blocks(idleMs, commands, device.heard).pipe(
      tap((state) => {
        latest = state
        if (state.block !== undefined) device.write(state.block)
      }),
      takeUntil(device.closed),
      finalize(() => {
        if (latest !== undefined) device.write(releaseMixer(latest))
        device.close()
      }),
      ignoreElements()
    )
  })

/**
 * One long-lived `ffplay` reading a WAV stream from stdin. The mixer writes a
 * continuous real-time stream, so tones start on the next 10 ms tick instead of
 * waiting for a process spawn, and overlapping tones are summed into one buffer
 * rather than racing separate processes.
 *
 * The first tone opens the device; `exhaustMap` keeps that one session for
 * every command that follows, and the next tone after an idle close opens
 * another.
 */
export const ffplay =
  ({ path, idleMs = IDLE_MS }: FfplayOptions): Backend =>
  (commands) =>
    commands.pipe(
      filter((command) => command.type === 'play'),
      exhaustMap((first) => session(path, idleMs, concat(of(first), commands)))
    )
