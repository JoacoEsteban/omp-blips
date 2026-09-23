import type { ConfigPatch } from './config.ts'
import {
  BLUES,
  HIRAJOSHI,
  KUMOI,
  MAJOR_PENTATONIC,
  MINOR_PENTATONIC
} from './scales.ts'

export const PRESET_NAMES = [
  'default',
  'arcade',
  'gamelan',
  'sonar',
  'typewriter',
  'music-box',
  'quiet'
] as const

export type PresetName = (typeof PRESET_NAMES)[number]

export interface Preset {
  /** One line, shown by `/blips presets`. */
  readonly description: string
  readonly patch: ConfigPatch
}

/**
 * A preset is a named `ConfigPatch` laid over the defaults, under whatever a
 * config file says. Each one is a different answer to the same question: what
 * should a stream of characters sound like?
 */
export const presets: Record<PresetName, Preset> = {
  default: {
    description: 'Prose melody, dark reasoning murmur, bright tool ticks.',
    patch: {}
  },

  // Bright modal tones with small intervals and a fast rate. The 2-character
  // rate makes prose sound like a text crawl.
  arcade: {
    description:
      'Bright modal tones. Fast, high, small sounds in a text crawl.',
    patch: {
      minIntervalMs: 45,
      voices: {
        text: {
          charsPerBlip: 2,
          toneMs: 34,
          volume: 0.28,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 440,
          scale: MAJOR_PENTATONIC,
          octaves: 3,
          mapping: 'wrap'
        },
        thinking: {
          charsPerBlip: 3,
          toneMs: 40,
          volume: 0.24,
          material: 'wood',
          touch: 'normal',
          baseFrequency: 220,
          scale: BLUES,
          octaves: 2,
          mapping: 'wrap'
        },
        tool: {
          charsPerBlip: 4,
          toneMs: 18,
          volume: 0.2,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 880,
          scale: MAJOR_PENTATONIC,
          octaves: 2,
          mapping: 'wrap'
        }
      }
    }
  },

  // Long decays overlap into each other. The tone cache makes this cheap,
  // and the ffplay mixer lets the tails ring together.
  gamelan: {
    description:
      'Struck ceramic and glass. Long ringing tones that overlap into a haze.',
    patch: {
      minIntervalMs: 150,
      voices: {
        text: {
          charsPerBlip: 6,
          toneMs: 260,
          volume: 0.3,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 415.3,
          scale: HIRAJOSHI,
          octaves: 2,
          mapping: 'fold'
        },
        thinking: {
          charsPerBlip: 8,
          toneMs: 420,
          volume: 0.26,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 155.56,
          scale: KUMOI,
          octaves: 2,
          mapping: 'fold'
        },
        tool: {
          charsPerBlip: 10,
          toneMs: 130,
          volume: 0.18,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 830.61,
          scale: HIRAJOSHI,
          octaves: 2,
          mapping: 'wrap'
        }
      }
    }
  },

  // One octave, very sparse, very slow. You stop hearing letters and start
  // hearing whether the agent is alive.
  sonar: {
    description: 'Submarine. One slow ping every few words, nothing else.',
    patch: {
      minIntervalMs: 420,
      voices: {
        text: {
          charsPerBlip: 14,
          toneMs: 680,
          decay: 0.25,
          volume: 0.34,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 174.61,
          scale: MINOR_PENTATONIC,
          octaves: 1,
          mapping: 'fold'
        },
        thinking: {
          charsPerBlip: 18,
          toneMs: 840,
          decay: 0.25,
          volume: 0.3,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 98,
          scale: MINOR_PENTATONIC,
          octaves: 1,
          mapping: 'fold'
        },
        tool: {
          charsPerBlip: 20,
          toneMs: 520,
          decay: 0.3,
          volume: 0.24,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 261.63,
          scale: MINOR_PENTATONIC,
          octaves: 1,
          mapping: 'wrap'
        }
      }
    }
  },

  // Almost no pitch range: the ear reads it as rhythm, not melody. Closest
  // thing to hearing a person type in the next room.
  typewriter: {
    description: 'Mechanical keys. Near-flat pitch, all rhythm.',
    patch: {
      minIntervalMs: 42,
      voices: {
        text: {
          charsPerBlip: 2,
          toneMs: 20,
          volume: 0.22,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 987.77,
          scale: MAJOR_PENTATONIC,
          octaves: 1,
          mapping: 'fold'
        },
        thinking: {
          charsPerBlip: 3,
          toneMs: 24,
          volume: 0.18,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 493.88,
          scale: MINOR_PENTATONIC,
          octaves: 1,
          mapping: 'fold'
        },
        tool: {
          charsPerBlip: 3,
          toneMs: 16,
          volume: 0.2,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 1318.51,
          scale: MAJOR_PENTATONIC,
          octaves: 1,
          mapping: 'wrap'
        }
      }
    }
  },

  // High, sweet, stepwise. `fold` everywhere, because leaps break the illusion.
  'music-box': {
    description: 'Wind-up music box. High, sweet, stepwise phrases.',
    patch: {
      minIntervalMs: 95,
      voices: {
        text: {
          charsPerBlip: 4,
          toneMs: 150,
          volume: 0.26,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 1046.5,
          scale: KUMOI,
          octaves: 2,
          mapping: 'fold'
        },
        thinking: {
          charsPerBlip: 5,
          toneMs: 210,
          volume: 0.22,
          material: 'ceramic',
          touch: 'soft',
          baseFrequency: 523.25,
          scale: KUMOI,
          octaves: 2,
          mapping: 'fold'
        },
        tool: {
          charsPerBlip: 8,
          toneMs: 90,
          volume: 0.16,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 1567.98,
          scale: MAJOR_PENTATONIC,
          octaves: 1,
          mapping: 'fold'
        }
      }
    }
  },

  // For shared rooms and long sessions: prose only, low gain, wide spacing.
  quiet: {
    description: 'Background. Prose only, low gain, wide spacing.',
    patch: {
      minIntervalMs: 190,
      voices: {
        text: {
          charsPerBlip: 7,
          toneMs: 70,
          volume: 0.14,
          mapping: 'fold',
          material: 'wood',
          touch: 'soft'
        },
        thinking: {
          charsPerBlip: 10,
          toneMs: 110,
          volume: 0.1,
          material: 'wood',
          touch: 'soft'
        },
        tool: { enabled: false, material: 'wood', touch: 'soft' }
      }
    }
  }
}
