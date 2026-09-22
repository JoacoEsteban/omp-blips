/**
 * Playback backend.
 * - `afplay`: macOS built-in, one process per tone, ~50 ms spawn latency.
 * - `ffplay`: long-lived PCM sink, near-zero latency and real mixing, needs ffmpeg.
 */
export type Backend = "afplay" | "ffplay"

/** Which part of the assistant stream a blip came from. */
export type StreamKind = "text" | "thinking" | "tool"

/** Voicing for one stream kind, so the three are audibly distinguishable. */
export interface VoiceConfig {
  readonly enabled: boolean
  /** Emit one blip every N streamed characters of this kind. */
  readonly charsPerBlip: number
  /** Length of a single tone, in milliseconds. */
  readonly toneMs: number
  /** Output gain, 0..1. */
  readonly volume: number
  /** Frequency of scale degree 0. */
  readonly baseFrequency: number
  /** Semitone offsets of one octave of the scale. */
  readonly scale: readonly number[]
  /** How many octaves the character range is spread over. */
  readonly octaves: number
}

export interface BlipConfig {
  /** Floor between two blips of any kind; faster streams get thinned out instead of stacked. */
  readonly minIntervalMs: number
  /** Which playback backend to use. */
  readonly backend: Backend
  readonly voices: Record<StreamKind, VoiceConfig>
}

/** Major pentatonic: no semitone clashes, so any character sequence stays consonant. */
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const
/** Minor pentatonic for reasoning: same no-clash property, darker colour. */
const MINOR_PENTATONIC = [0, 3, 5, 7, 10] as const

export const defaultConfig: BlipConfig = {
  minIntervalMs: 70,
  backend: "ffplay",
  voices: {
    // Prose: mid register, the voice the ear tracks.
    text: {
      enabled: true,
      charsPerBlip: 3,
      toneMs: 55,
      volume: 0.35,
      baseFrequency: 220,
      scale: MAJOR_PENTATONIC,
      octaves: 3,
    },
    // Reasoning: a darker voice below the prose. 110 Hz fundamentals are easy to
    // lose on laptop speakers, so it sits at 146.83 Hz (D3) with more gain.
    thinking: {
      enabled: true,
      charsPerBlip: 4,
      toneMs: 90,
      volume: 0.32,
      baseFrequency: 146.83,
      scale: MINOR_PENTATONIC,
      octaves: 2,
    },
    // Tool arguments: short, bright ticks. Dense JSON, so it blips less often.
    tool: {
      enabled: true,
      charsPerBlip: 6,
      toneMs: 26,
      volume: 0.22,
      baseFrequency: 523.25,
      scale: MAJOR_PENTATONIC,
      octaves: 2,
    },
  },
}
