import { MAJOR_PENTATONIC, MINOR_PENTATONIC } from './scales.ts'
import type { ColorConfig } from './color.ts'
import type { PitchConfig } from './pitch.ts'
import type { ReadingConfig } from './reading.ts'
import type { Material, Touch } from './synth.ts'

/**
 * Playback backend.
 * - `afplay`: macOS built-in, one process per tone, ~50 ms spawn latency.
 * - `ffplay`: long-lived PCM sink, near-zero latency and real mixing, needs ffmpeg.
 */
export type BackendName = 'afplay' | 'ffplay'

/** Which part of the assistant stream a blip came from. */
export type StreamKind = 'text' | 'thinking' | 'tool'

/** Voicing for one stream kind, so the three are audibly distinguishable. */
export interface VoiceConfig {
  readonly enabled: boolean
  /** Length of a single tone, in milliseconds. */
  readonly toneMs: number
  /** Multiplier for the material's modal decay rate; lower values ring longer. */
  readonly decay: number
  /** Fraction of the tone spent rising to full level; 0 leaves the touch's attack. */
  readonly swell: number
  /** Fraction of the tone held at full body before the decay starts, 0..1. */
  readonly hold: number
  /** Semitones the pitch falls across a single tone; 0 is a steady pitch. */
  readonly glide: number
  /** Output gain, 0..1. */
  readonly volume: number
  /** Modal material for this stream. */
  readonly material: Material
  /** How a character index becomes a vowel colour, for sustained materials. */
  readonly color: ColorConfig
  /** Strike force for this stream. */
  readonly touch: Touch
  /** Frequency of index 0, and the whole of a `drone` voice. */
  readonly baseFrequency: number
  /** How characters become indices: what is voiced, what is silent, what an index means. */
  readonly reading: ReadingConfig
  /** How an index becomes a frequency. */
  readonly pitch: PitchConfig
}

export interface BlipConfig {
  /** Floor between two blips of any kind; faster streams get thinned out instead of stacked. */
  readonly minIntervalMs: number
  /** Which playback backend to use. */
  readonly backend: BackendName
  readonly voices: Record<StreamKind, VoiceConfig>
}

/** A partial voice, as a preset or a config file supplies it. */
export type VoicePatch = {
  readonly [K in keyof VoiceConfig]?: VoiceConfig[K] | undefined
}

/** A partial config: presets and config files are both this shape. */
export interface ConfigPatch {
  readonly minIntervalMs?: number | undefined
  readonly backend?: BackendName | undefined
  readonly voices?:
    { readonly [K in StreamKind]?: VoicePatch | undefined } | undefined
}

export const defaultConfig: BlipConfig = {
  minIntervalMs: 70,
  backend: 'ffplay',
  voices: {
    // Prose: mid register, the voice the ear tracks.
    text: {
      enabled: true,
      toneMs: 55,
      decay: 1,
      swell: 0,
      hold: 0,
      glide: 0,
      volume: 0.35,
      material: 'ceramic',
      color: { kind: 'fixed', at: 0.5 },
      touch: 'normal',
      baseFrequency: 220,
      reading: { kind: 'alphabet', every: 3 },
      pitch: {
        kind: 'scalar',
        scale: MAJOR_PENTATONIC,
        octaves: 3,
        mapping: 'wrap'
      }
    },
    // Reasoning: a darker voice below the prose. 110 Hz fundamentals are easy to
    // lose on laptop speakers, so it sits at 146.83 Hz (D3) with more gain.
    thinking: {
      enabled: true,
      toneMs: 90,
      decay: 1,
      swell: 0,
      hold: 0,
      glide: 0,
      volume: 0.32,
      material: 'wood',
      color: { kind: 'fixed', at: 0.5 },
      touch: 'soft',
      baseFrequency: 146.83,
      reading: { kind: 'alphabet', every: 4 },
      pitch: {
        kind: 'scalar',
        scale: MINOR_PENTATONIC,
        octaves: 2,
        mapping: 'fold'
      }
    },
    // Tool arguments: short, bright ticks. Dense JSON, so it blips less often.
    tool: {
      enabled: true,
      toneMs: 26,
      decay: 1,
      swell: 0,
      hold: 0,
      glide: 0,
      volume: 0.22,
      material: 'glass',
      color: { kind: 'fixed', at: 0.5 },
      touch: 'soft',
      baseFrequency: 523.25,
      reading: { kind: 'alphabet', every: 6 },
      pitch: {
        kind: 'scalar',
        scale: MAJOR_PENTATONIC,
        octaves: 2,
        mapping: 'wrap'
      }
    }
  }
}
