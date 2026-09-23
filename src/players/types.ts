import type { Sound } from '../synth.ts'

/** One scheduled blip: everything a backend needs to make a sound. */
export interface Tone extends Sound {
  readonly volume: number
}

export interface Player {
  /** Play a tone. Never throws. */
  readonly play: (tone: Tone) => void
  /** Silence whatever is sounding now, but stay ready for the next tone. */
  readonly flush: () => void
  /** Stop everything and release any audio process. */
  readonly dispose: () => void
}
