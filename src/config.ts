import { MAJOR_PENTATONIC, MINOR_PENTATONIC } from './scales.ts'
import type { ColorConfig } from './color.ts'
import type { PitchConfig } from './pitch.ts'
import type { ReadingConfig } from './reading.ts'
import type { SpatialConfig } from './spatial.ts'
import type { Material, Touch } from './synth.ts'

export const STREAM_KINDS = ['text', 'thinking', 'tool'] as const

export type StreamKind = (typeof STREAM_KINDS)[number]

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
  /**
   * Ticks the cursor may take to cross whatever backlog it finds. A wide
   * window keeps the stride at its configured width through a burst, at the
   * cost of trailing the text for longer. A narrow one stays in step with the
   * text and spends resolution to do it.
   */
  readonly catchup: number
  readonly toneMs: number
  readonly decay: number
  readonly swell: number
  readonly hold: number
  readonly glide: number
  readonly volume: number
  readonly material: Material
  readonly color: ColorConfig
  readonly touch: Touch
  readonly baseFrequency: number
  readonly reading: ReadingConfig
  readonly pitch: PitchConfig
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

export type VoicePatch = {
  readonly [K in keyof VoiceConfig]?: VoiceConfig[K] | undefined
}

export interface ConfigPatch {
  readonly tickHz?: number | undefined
  readonly voices?:
    { readonly [K in StreamKind]?: VoicePatch | undefined } | undefined
}

export const defaultConfig: BlipConfig = {
  tickHz: 20,
  voices: {
    text: {
      enabled: true,
      divisor: 2,
      stride: 3,
      catchup: 8,
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
    thinking: {
      enabled: true,
      divisor: 3,
      stride: 4,
      catchup: 8,
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
    tool: {
      enabled: true,
      divisor: 1,
      stride: 8,
      catchup: 8,
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
