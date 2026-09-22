/** Tuning knobs for the blip stream. Every duration is in milliseconds. */
export interface BlipConfig {
  /** Emit one blip every N streamed characters. */
  readonly charsPerBlip: number
  /** Floor between two blips; faster streams get thinned out instead of stacked. */
  readonly minIntervalMs: number
  /** Length of a single tone. */
  readonly toneMs: number
  /** `afplay -v` gain, 0..1. */
  readonly volume: number
  /** Frequency of scale degree 0. */
  readonly baseFrequency: number
  /** Semitone offsets of one octave of the scale. */
  readonly scale: readonly number[]
  /** How many octaves the character range is spread over. */
  readonly octaves: number
  /** Also blip on reasoning deltas. */
  readonly thinking: boolean
}

/** Major pentatonic: no semitone clashes, so any character sequence stays consonant. */
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const

export const defaultConfig: BlipConfig = {
  charsPerBlip: 3,
  minIntervalMs: 70,
  toneMs: 55,
  volume: 0.35,
  baseFrequency: 220,
  scale: MAJOR_PENTATONIC,
  octaves: 3,
  thinking: false,
}
