import { spawn, type ChildProcess } from "node:child_process"
import { SAMPLE_RATE, toInt16, voice } from "../synth.ts"
import type { Player, Tone } from "./types.ts"

/** How often the mixer wakes up to top up the pipe. */
const TICK_MS = 10
/** Audio written ahead of the wall clock. Lower is tighter, but underruns crackle. */
const LEAD_MS = 40
/** Tear the process down after this much silence; it is respawned on the next blip. */
const IDLE_MS = 20_000
/** Simultaneous tones in the mix. */
const MAX_VOICES = 8
/** Ramp to silence over this long on a flush; cutting a ringing voice dead clicks. */
const FADE_MS = 6

/** Samples of write-ahead the mixer maintains. */
const LEAD_FRAMES = Math.round((LEAD_MS * SAMPLE_RATE) / 1000)
/** Largest block written in one tick; anything beyond this was starved, not buffered. */
const MAX_BLOCK_FRAMES = LEAD_FRAMES + Math.round((TICK_MS * SAMPLE_RATE) / 1000)
/** Samples the flush ramp takes to reach zero. */
const FADE_FRAMES = Math.max(1, Math.round((FADE_MS * SAMPLE_RATE) / 1000))

const FFPLAY_ARGS = [
 "-hide_banner",
 "-loglevel",
 "quiet",
 "-nodisp",
 "-autoexit",
 "-fflags",
 "nobuffer",
 "-flags",
 "low_delay",
 "-probesize",
 "32",
 "-analyzeduration",
 "0",
 "-f",
 "s16le",
 "-ar",
 String(SAMPLE_RATE),
 "-ch_layout",
 "mono",
 "-i",
 "pipe:0",
]

interface ActiveVoice {
 readonly samples: Float32Array
 readonly gain: number
 offset: number
}

export interface FfplayPlayerOptions {
 /** Silence before shutdown. Use `Infinity` to keep the process for the caller's lifetime. */
 readonly idleMs?: number
}

/**
 * One long-lived `ffplay` reading raw PCM from stdin. The mixer writes a
 * continuous real-time stream, so tones start on the next 10 ms tick instead
 * of waiting for a process spawn, and overlapping tones are summed into one
 * buffer rather than racing separate processes.
 */
export const createFfplayPlayer = ({ idleMs = IDLE_MS }: FfplayPlayerOptions = {}): Player => {
 const active: ActiveVoice[] = []
 let child: ChildProcess | undefined
 let ticker: NodeJS.Timeout | undefined
 let startedAt = 0
 let cursor = 0
 let lastVoiceAt = 0
 /** Samples left in an in-progress flush ramp; 0 when no flush is pending. */
 let fadeFrames = 0

 const stop = (): void => {
  if (ticker !== undefined) clearInterval(ticker)
  ticker = undefined
  active.length = 0
  fadeFrames = 0
  child?.stdin?.end()
  child?.kill("SIGTERM")
  child = undefined
 }

 /** Advance every voice by `frames` samples, retiring the ones that ran out. */
 const advance = (frames: number): void => {
  for (let i = active.length - 1; i >= 0; i -= 1) {
   const v = active[i]
   if (v === undefined) continue
   v.offset += frames
   if (v.offset >= v.samples.length) active.splice(i, 1)
  }
 }

 /** Mix `frames` samples from the active voices into little-endian PCM. */
 const mix = (frames: number): Buffer => {
  const block = Buffer.alloc(frames * 2)

  // Once the ramp retires the voices there is nothing left to sum, and the
  // rest of the block stays at the zeros `alloc` already wrote.
  for (let i = 0; i < frames && active.length > 0; i += 1) {
   let sum = 0
   for (const v of active) {
    const sample = v.samples[v.offset + i]
    if (sample !== undefined) sum += sample * v.gain
   }

   if (fadeFrames > 0) {
    fadeFrames -= 1
    sum *= fadeFrames / FADE_FRAMES
    if (fadeFrames === 0) active.length = 0
   }

   block.writeInt16LE(toInt16(sum), i * 2)
  }

  advance(frames)
  return block
 }

 const tick = (): void => {
  const now = performance.now()
  if (active.length === 0 && now - lastVoiceAt > idleMs) {
   stop()
   return
  }

  const target = Math.floor(((now - startedAt) * SAMPLE_RATE) / 1000) + LEAD_FRAMES
  const frames = Math.floor(target - cursor)
  if (frames <= 0) return
  cursor += frames

  // The pipe drops nothing, so a stalled event loop would otherwise push every
  // later blip back by the stall and never recover. Skip the starved span
  // instead: the voices age as if it had played, so audio stays in sync with
  // the text at the cost of a gap.
  const starved = frames - MAX_BLOCK_FRAMES
  if (starved > 0) advance(starved)

  child?.stdin?.write(mix(Math.min(frames, MAX_BLOCK_FRAMES)))
 }

 const start = (): void => {
  child = spawn("ffplay", FFPLAY_ARGS, { stdio: ["pipe", "ignore", "ignore"] })
  child.on("error", stop)
  child.on("exit", () => {
   child = undefined
   stop()
  })
  child.stdin?.on("error", () => { })

  startedAt = performance.now()
  cursor = 0
  ticker = setInterval(() => {
   try {
    tick()
   } catch {
    stop()
   }
  }, TICK_MS)
  ticker.unref?.()
 }

 const play = (tone: Tone): void => {
  if (child === undefined) start()
  lastVoiceAt = performance.now()
  // A blip arriving mid-ramp means the stream is live again: drop what was
  // fading rather than let the ramp swallow the new voice too.
  if (fadeFrames > 0) {
   active.length = 0
   fadeFrames = 0
  }
  if (active.length >= MAX_VOICES) return
  active.push({ samples: voice(tone), gain: tone.volume, offset: 0 })
 }

 /**
  * Ramp the active voices to silence and keep the process. Up to `LEAD_MS` of
  * audio is already in the pipe and past recall, so the silence lands that
  * much after the call.
  */
 const flush = (): void => {
  if (active.length > 0) fadeFrames = FADE_FRAMES
 }

 return { play, flush, dispose: stop }
}
