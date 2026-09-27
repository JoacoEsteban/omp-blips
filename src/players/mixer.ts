import { match } from 'ts-pattern'
import { SAMPLE_RATE, toInt16, voice } from '../synth.ts'
import type { SpatialMotion } from '../spatial.ts'
import type { Tone } from './types.ts'

export const TICK_MS = 10
/** Audio written ahead of the wall clock. Lower is tighter, but underruns crackle. */
const LEAD_MS = 40
/** Ramp to silence over this long on a flush; cutting a ringing voice dead clicks. */
const FADE_MS = 6
/**
 * Simultaneous tones in the mix. The cost of the mix is linear in this: 32
 * voices cost under a tenth of a 10 ms block, and under a fifth of one when
 * every voice carries motion, which recomputes its pan for each frame. It is
 * set well above what a preset needs — three voices on a 250 Hz grid share
 * 128 ms of tone at this cap — because the tone that a full mix refuses is a
 * character that never sounds.
 */
const MAX_VOICES = 32

const LEAD_FRAMES = Math.round((LEAD_MS * SAMPLE_RATE) / 1000)
/** Largest block written in one tick; anything beyond this was starved, not buffered. */
const MAX_BLOCK_FRAMES =
  LEAD_FRAMES + Math.round((TICK_MS * SAMPLE_RATE) / 1000)
const FADE_FRAMES = Math.max(1, Math.round((FADE_MS * SAMPLE_RATE) / 1000))

/** The mixer never duplicates a mono cache. */
export type Source =
  | { readonly kind: 'mono'; readonly samples: Float32Array }
  | {
      readonly kind: 'stereo'
      readonly left: Float32Array
      readonly right: Float32Array
    }

export interface StereoFrame {
  left: number
  right: number
}

const sourceLength = (source: Source): number => {
  if (source.kind === 'mono') return source.samples.length
  return Math.min(source.left.length, source.right.length)
}

/**
 * Stereo input is treated as one positioned source: at either hard edge both
 * input channels remain audible, unlike a balance control which discards one
 * channel.
 */
export const renderSource = (
  source: Source,
  index: number,
  pan: number,
  leftGain: number,
  rightGain: number,
  output: StereoFrame
): void => {
  if (source.kind === 'mono') {
    const sample = source.samples[index] ?? 0
    output.left = sample * leftGain
    output.right = sample * rightGain
    return
  }

  const left = source.left[index] ?? 0
  const right = source.right[index] ?? 0
  if (pan > 0) {
    output.left = left * (1 - pan)
    output.right = right + left * pan
    return
  }
  output.left = left + right * -pan
  output.right = right * (1 + pan)
}

interface Ringing {
  readonly source: Source
  readonly gain: number
  /**
   * Samples of this source already rendered. It starts negative when the tone
   * asked for a moment inside the block rather than its head: those frames are
   * the silence it waits through first.
   */
  readonly offset: number
  readonly spatial: Tone['spatial']
  /** Zero means ringing naturally; positive means a per-tone release is active. */
  readonly release: number
  readonly leftGain: number
  readonly rightGain: number
}

export interface MixerState {
  readonly openedAt: number
  readonly ringing: readonly Ringing[]
  readonly cursor: number
  readonly tickedAt: number
  readonly lastToneAt: number
  /** No further tones can arrive: the command stream is finished. */
  readonly ended: boolean
  readonly block: Buffer | undefined
  /** Nothing rings and nothing more will: the device can be released. */
  readonly done: boolean
}

export type MixerEvent =
  | { readonly type: 'play'; readonly tone: Tone; readonly at: number }
  | { readonly type: 'flush' }
  | { readonly type: 'tick'; readonly at: number }
  | { readonly type: 'end' }

export const openMixer = (at: number): MixerState => ({
  openedAt: at,
  ringing: [],
  cursor: 0,
  tickedAt: at,
  lastToneAt: at,
  ended: false,
  block: undefined,
  done: false
})

const panGains = (pan: number): readonly [number, number] => {
  const bounded = Math.max(-1, Math.min(1, pan))
  const angle = ((bounded + 1) * Math.PI) / 4
  return [Math.cos(angle), Math.sin(angle)]
}

const motionPan = (
  base: number,
  motion: SpatialMotion,
  offset: number,
  cursor: number,
  openedAt: number
): number => {
  let elapsed = (offset * 1000) / SAMPLE_RATE
  if (motion.clock === 'voice')
    elapsed = openedAt + (cursor * 1000) / SAMPLE_RATE
  const pan =
    base + motion.depth * Math.sin((2 * Math.PI * elapsed) / motion.periodMs)
  return Math.max(-1, Math.min(1, pan))
}

const advance = (
  ringing: readonly Ringing[],
  frames: number
): readonly Ringing[] =>
  ringing.flatMap((sound) => {
    const offset = sound.offset + frames
    const release = Math.max(0, sound.release - frames)
    const ended = offset >= sourceLength(sound.source)
    if (ended || (sound.release > 0 && release === 0)) return []
    return [{ ...sound, offset, release }]
  })

interface Mixed {
  readonly block: Buffer
  readonly ringing: readonly Ringing[]
}

const mixBlock = (
  ringing: readonly Ringing[],
  frames: number,
  cursor: number,
  openedAt: number
): Mixed => {
  const block = Buffer.alloc(frames * 4)
  const frame: StereoFrame = { left: 0, right: 0 }

  for (let i = 0; i < frames && ringing.length > 0; i += 1) {
    let left = 0
    let right = 0
    for (const sound of ringing) {
      const index = sound.offset + i
      // The tone has not started yet: it asked for a sample further into this
      // block, and the frames before it are silence.
      if (index < 0) continue
      const motion = sound.spatial.motion
      let pan = sound.spatial.at
      let leftGain = sound.leftGain
      let rightGain = sound.rightGain
      if (motion !== undefined) {
        pan = motionPan(sound.spatial.at, motion, index, cursor + i, openedAt)
        const angle = ((pan + 1) * Math.PI) / 4
        leftGain = Math.cos(angle)
        rightGain = Math.sin(angle)
      }
      renderSource(sound.source, index, pan, leftGain, rightGain, frame)
      let releaseGain = 1
      if (sound.release > 0)
        releaseGain = Math.max(0, sound.release - i - 1) / FADE_FRAMES
      left += frame.left * sound.gain * releaseGain
      right += frame.right * sound.gain * releaseGain
    }
    block.writeInt16LE(toInt16(left), i * 4)
    block.writeInt16LE(toInt16(right), i * 4 + 2)
  }
  return { block, ringing: advance(ringing, frames) }
}

/**
 * A tone starts at the sample its event asked for, not at the head of the next
 * block. The block about to be written begins at the wall clock of the last
 * tick, so the distance from there to `at` is the silence the tone waits
 * through first. Without it every tone inside a tick would collapse onto the
 * same instant, which caps an even grid at one tone per block.
 */
const struck = (state: MixerState, tone: Tone, at: number): MixerState => {
  if (state.ringing.length >= MAX_VOICES) return { ...state, block: undefined }
  const gains = panGains(tone.spatial.at)
  const waited = Math.max(
    0,
    Math.round(((at - state.tickedAt) * SAMPLE_RATE) / 1000)
  )
  return {
    ...state,
    lastToneAt: at,
    ringing: [
      ...state.ringing,
      {
        source: { kind: 'mono', samples: voice(tone) },
        gain: tone.volume,
        offset: -waited,
        spatial: tone.spatial,
        release: 0,
        leftGain: gains[0],
        rightGain: gains[1]
      }
    ],
    block: undefined
  }
}

const releaseAll = (ringing: readonly Ringing[]): readonly Ringing[] =>
  ringing.map((sound) => {
    if (sound.release > 0) return sound
    return { ...sound, release: FADE_FRAMES }
  })
export const releaseMixer = (state: MixerState): Buffer =>
  mixBlock(releaseAll(state.ringing), FADE_FRAMES, state.cursor, state.openedAt)
    .block

const ticked = (idleMs: number, state: MixerState, at: number): MixerState => {
  const spent = state.ringing.length === 0
  if (spent && (state.ended || at - state.lastToneAt > idleMs))
    return { ...state, block: undefined, done: true }

  const target =
    Math.floor(((at - state.openedAt) * SAMPLE_RATE) / 1000) + LEAD_FRAMES
  const frames = Math.floor(target - state.cursor)
  if (frames <= 0) return { ...state, block: undefined }

  // The pipe drops nothing, so a stalled event loop would otherwise push every
  // later blip back by the stall and never recover. Skip the starved span
  // instead: the voices age as if it had played, so audio stays in sync with
  // the text at the cost of a gap.
  const starved = frames - MAX_BLOCK_FRAMES
  let ready = state.ringing
  if (starved > 0) ready = advance(state.ringing, starved)
  const written = Math.min(frames, MAX_BLOCK_FRAMES)
  const mixCursor = state.cursor + Math.max(0, starved)
  const mixed = mixBlock(ready, written, mixCursor, state.openedAt)

  return {
    ...state,
    cursor: state.cursor + frames,
    // The block that follows begins where this one ended, which is now.
    tickedAt: at,
    ringing: mixed.ringing,
    block: mixed.block,
    done: false
  }
}

/**
 * `idleMs` is how much silence releases the device; `Infinity` keeps it for as
 * long as the commands last.
 */
export const mixerStep =
  (idleMs: number) =>
  (state: MixerState, event: MixerEvent): MixerState =>
    match(event)
      .with({ type: 'play' }, ({ tone, at }) => struck(state, tone, at))
      .with({ type: 'flush' }, () => ({
        ...state,
        ringing: releaseAll(state.ringing),
        block: undefined
      }))
      .with({ type: 'tick' }, ({ at }) => ticked(idleMs, state, at))
      .with({ type: 'end' }, () => ({
        ...state,
        ended: true,
        block: undefined,
        done: state.ringing.length === 0
      }))
      .exhaustive()
