import { MAJOR_PENTATONIC, MINOR_PENTATONIC } from './scales.ts'
import type { ColorConfig } from './color.ts'
import type { PitchConfig } from './pitch.ts'
import type { ReadingConfig } from './reading.ts'
import type { SpatialConfig } from './spatial.ts'
import type { Material, Touch } from './synth.ts'

/** Which part of the assistant stream a blip came from. */
export type StreamKind = 'text' | 'thinking' | 'tool'

/** Voicing for one stream kind, so the three are audibly distinguishable. */
export interface VoiceConfig {
  readonly enabled: boolean
  /**
   * Ticks of the shared grid spent on one blip. The grid is global so the three
   * voices stay locked to each other; this is the only rate a voice chooses,
   * and it chooses a multiple rather than a rate of its own.
   */
  readonly divisor: number
  /**
   * Graphemes the cursor walks for each blip. It is the sampling interval in
   * the text, not in time: the grid decides when a blip happens, this decides
   * how much text that blip stands for.
   */
  readonly stride: number
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
  /** Material for this stream. */
  readonly material: Material
  /** How a character index becomes a colour for sustained materials. */
  readonly color: ColorConfig
  /** Strike force for this stream. */
  readonly touch: Touch
  /** Frequency of index 0, and the whole of a `drone` voice. */
  readonly baseFrequency: number
  /** How characters become indices: what is voiced, what is silent, what an index is. */
  readonly reading: ReadingConfig
  /** How an index becomes a frequency. */
  readonly pitch: PitchConfig
  /** Where this stream's tones sit in the stereo field. */
  readonly spatial: SpatialConfig
}

export interface BlipConfig {
  /**
   * The shared grid, in ticks per second. Every voice sounds on a multiple of
   * it, so tempo is a property of the preset rather than of how fast the
   * provider happens to deliver its deltas.
   */
  readonly tickHz: number
  readonly voices: Record<StreamKind, VoiceConfig>
}

/** A partial voice, as a preset or a config file supplies it. */
export type VoicePatch = {
  readonly [K in keyof VoiceConfig]?: VoiceConfig[K] | undefined
}

/** A partial config: presets and config files are both this shape. */
export interface ConfigPatch {
  readonly tickHz?: number | undefined
  readonly voices?:
    { readonly [K in StreamKind]?: VoicePatch | undefined } | undefined
}

export const defaultConfig: BlipConfig = {
  tickHz: 20,
  voices: {
    // Prose: mid register, the voice the ear tracks. Every other tick, so it
    // sits at half the grid and the other two read against it.
    text: {
      enabled: true,
      divisor: 2,
      stride: 3,
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
      reading: { kind: 'alphabet' },
      pitch: {
        kind: 'scalar',
        scale: MAJOR_PENTATONIC,
        octaves: 3,
        mapping: 'wrap'
      },
      spatial: { placement: { kind: 'fixed', at: 0 } }
    },
    // Reasoning: a darker voice below the prose. 110 Hz fundamentals are easy to
    // lose on laptop speakers, so it sits at 146.83 Hz (D3) with more gain.
    thinking: {
      enabled: true,
      divisor: 3,
      stride: 4,
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
      reading: { kind: 'alphabet' },
      pitch: {
        kind: 'scalar',
        scale: MINOR_PENTATONIC,
        octaves: 2,
        mapping: 'fold'
      },
      spatial: { placement: { kind: 'fixed', at: 0 } }
    },
    // Tool arguments: short, bright ticks on every beat of the grid. Dense
    // JSON, so the cursor takes a long stride and each tick stands for more.
    tool: {
      enabled: true,
      divisor: 1,
      stride: 8,
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
      reading: { kind: 'alphabet' },
      pitch: {
        kind: 'scalar',
        scale: MAJOR_PENTATONIC,
        octaves: 2,
        mapping: 'wrap'
      },
      spatial: { placement: { kind: 'fixed', at: 0 } }
    }
  }
}
