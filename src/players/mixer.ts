import { match } from 'ts-pattern'
import { SAMPLE_RATE, toInt16, voice } from '../synth.ts'
import type { Tone } from './types.ts'

/** How often the mixer wakes up to top up the pipe. */
export const TICK_MS = 10
/** Audio written ahead of the wall clock. Lower is tighter, but underruns crackle. */
const LEAD_MS = 40
/** Ramp to silence over this long on a flush; cutting a ringing voice dead clicks. */
const FADE_MS = 6
/** Simultaneous tones in the mix. */
const MAX_VOICES = 8

/** Samples of write-ahead the mixer maintains. */
const LEAD_FRAMES = Math.round((LEAD_MS * SAMPLE_RATE) / 1000)
/** Largest block written in one tick; anything beyond this was starved, not buffered. */
const MAX_BLOCK_FRAMES =
  LEAD_FRAMES + Math.round((TICK_MS * SAMPLE_RATE) / 1000)
/** Samples the flush ramp takes to reach zero. */
const FADE_FRAMES = Math.max(1, Math.round((FADE_MS * SAMPLE_RATE) / 1000))

/** A rendered tone part-way through the mix. */
interface Ringing {
  readonly samples: Float32Array
  readonly gain: number
  readonly offset: number
}

/**
 * Everything the mixer knows between two events. The state is a value: a step
 * reads one and returns the next, so the mix is a fold over play, flush, and
 * clock events rather than a pile of mutable timers.
 */
export interface MixerState {
  /** Wall clock the sample cursor is measured from. */
  readonly openedAt: number
  readonly ringing: readonly Ringing[]
  /** Samples handed to the device so far. */
  readonly cursor: number
  /** Samples left in an in-progress flush ramp; 0 when no flush is pending. */
  readonly fade: number
  readonly lastToneAt: number
  /** No further tones can arrive: the command stream is finished. */
  readonly ended: boolean
  /** PCM produced by the step that made this state, if it produced any. */
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
  fade: 0,
  lastToneAt: at,
  ended: false,
  block: undefined,
  done: false
})

/** Age every voice by `frames` samples, retiring the ones that ran out. */
const advance = (
  ringing: readonly Ringing[],
  frames: number
): readonly Ringing[] =>
  ringing
    .filter((sound) => sound.offset + frames < sound.samples.length)
    .map((sound) => ({
      samples: sound.samples,
      gain: sound.gain,
      offset: sound.offset + frames
    }))

interface Mixed {
  readonly block: Buffer
  readonly fade: number
  /** The flush ramp reached zero inside this block; the voices are spent. */
  readonly cut: boolean
}

/** Sum `frames` samples of the ringing voices into little-endian PCM. */
const mixBlock = (
  ringing: readonly Ringing[],
  fade: number,
  frames: number
): Mixed => {
  const block = Buffer.alloc(frames * 2)
  let remaining = fade
  let cut = false

  // Once the ramp retires the voices there is nothing left to sum, and the rest
  // of the block stays at the zeros `alloc` already wrote.
  for (let i = 0; i < frames && !cut && ringing.length > 0; i += 1) {
    let sum = 0
    for (const sound of ringing) {
      const sample = sound.samples[sound.offset + i]
      if (sample !== undefined) sum += sample * sound.gain
    }

    if (remaining > 0) {
      remaining -= 1
      sum *= remaining / FADE_FRAMES
      cut = remaining === 0
    }

    block.writeInt16LE(toInt16(sum), i * 2)
  }

  return { block, fade: remaining, cut }
}

const struck = (state: MixerState, tone: Tone, at: number): MixerState => {
  // A tone arriving mid-ramp means the stream is live again: drop what was
  // fading rather than let the ramp swallow the new voice too.
  const ringing = match(state.fade > 0)
    .with(true, (): readonly Ringing[] => [])
    .with(false, () => state.ringing)
    .exhaustive()

  return {
    ...state,
    fade: 0,
    lastToneAt: at,
    ringing: match(ringing.length >= MAX_VOICES)
      .with(true, () => ringing)
      .with(false, () => [
        ...ringing,
        { samples: voice(tone), gain: tone.volume, offset: 0 }
      ])
      .exhaustive(),
    block: undefined
  }
}

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
  const ready = match(starved > 0)
    .with(true, () => advance(state.ringing, starved))
    .with(false, () => state.ringing)
    .exhaustive()

  const written = Math.min(frames, MAX_BLOCK_FRAMES)
  const mixed = mixBlock(ready, state.fade, written)

  return {
    ...state,
    cursor: state.cursor + frames,
    ringing: match(mixed.cut)
      .with(true, (): readonly Ringing[] => [])
      .with(false, () => advance(ready, written))
      .exhaustive(),
    fade: mixed.fade,
    block: mixed.block,
    done: false
  }
}

/**
 * One step of the mix, as a fold. `idleMs` is how much silence releases the
 * device; `Infinity` keeps it for as long as the commands last.
 */
export const mixerStep =
  (idleMs: number) =>
  (state: MixerState, event: MixerEvent): MixerState =>
    match(event)
      .with({ type: 'play' }, ({ tone, at }) => struck(state, tone, at))
      .with({ type: 'flush' }, () => ({
        ...state,
        // Nothing rings, so there is nothing to ramp down.
        fade: match(state.ringing.length > 0)
          .with(true, () => FADE_FRAMES)
          .with(false, () => 0)
          .exhaustive(),
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
