import type { ConfigPatch } from './config.ts'
import { sansPreset } from './preset-sans.ts'
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
  'quiet',
  'haiku',
  'pulse',
  'plainchant',
  'cipher',
  'telegraph',
  'hexdump',
  'sans'
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
          toneMs: 34,
          volume: 0.28,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 440,
          reading: { kind: 'alphabet', every: 2 },
          pitch: {
            kind: 'scalar',
            scale: MAJOR_PENTATONIC,
            octaves: 3,
            mapping: 'wrap'
          }
        },
        thinking: {
          toneMs: 40,
          volume: 0.24,
          material: 'wood',
          touch: 'normal',
          baseFrequency: 220,
          reading: { kind: 'alphabet', every: 3 },
          pitch: { kind: 'scalar', scale: BLUES, octaves: 2, mapping: 'wrap' }
        },
        tool: {
          toneMs: 18,
          volume: 0.2,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 880,
          // Dense JSON read character by character, semitones apart: an arcade
          // machine reporting progress, not a melody.
          reading: { kind: 'codepoint', span: 16, every: 4 },
          pitch: { kind: 'chromatic', span: 7 }
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
          toneMs: 260,
          volume: 0.3,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 415.3,
          // One ring per word, climbing across a sentence and dropping at its
          // end. The words pace it; nothing samples the letters inside them.
          reading: { kind: 'phrase', span: 4 },
          pitch: {
            kind: 'scalar',
            scale: HIRAJOSHI,
            octaves: 2,
            mapping: 'fold'
          }
        },
        thinking: {
          toneMs: 420,
          volume: 0.26,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 155.56,
          reading: { kind: 'phrase', span: 3 },
          pitch: { kind: 'scalar', scale: KUMOI, octaves: 2, mapping: 'fold' }
        },
        tool: {
          toneMs: 130,
          volume: 0.18,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 830.61,
          // One struck pitch under the tails of the other two voices.
          reading: { kind: 'class', every: 10 },
          pitch: { kind: 'drone' }
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
          toneMs: 680,
          decay: 0.25,
          volume: 0.34,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 174.61,
          // Vowels only, on one pitch: a ping per few words, and nothing in
          // between. Consonants would make it a melody again.
          reading: { kind: 'vowels', every: 5 },
          pitch: { kind: 'drone' }
        },
        thinking: {
          toneMs: 840,
          decay: 0.25,
          volume: 0.3,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 98,
          reading: { kind: 'vowels', every: 6 },
          pitch: { kind: 'drone' }
        },
        tool: {
          toneMs: 520,
          decay: 0.3,
          volume: 0.24,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 261.63,
          reading: { kind: 'vowels', every: 6 },
          pitch: { kind: 'drone' }
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
          toneMs: 20,
          volume: 0.22,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 987.77,
          // Four character classes over two semitones: the pitch barely moves,
          // so the ear hears the keys and not the letters.
          reading: { kind: 'class', every: 2 },
          pitch: { kind: 'chromatic', span: 2 }
        },
        thinking: {
          toneMs: 24,
          volume: 0.18,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 493.88,
          reading: { kind: 'class', every: 3 },
          pitch: { kind: 'chromatic', span: 2 }
        },
        tool: {
          toneMs: 16,
          volume: 0.2,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 1318.51,
          reading: { kind: 'class', every: 3 },
          pitch: { kind: 'drone' }
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
          toneMs: 150,
          volume: 0.26,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 1046.5,
          // One note per word, and `step: 1` walks the scale in order: this is
          // the preset whose whole character is stepwise motion.
          reading: { kind: 'phrase', span: 6 },
          pitch: { kind: 'scalar', scale: KUMOI, octaves: 2, mapping: 'fold' }
        },
        thinking: {
          toneMs: 210,
          volume: 0.22,
          material: 'ceramic',
          touch: 'soft',
          baseFrequency: 523.25,
          reading: { kind: 'phrase', span: 6 },
          pitch: { kind: 'scalar', scale: KUMOI, octaves: 2, mapping: 'fold' }
        },
        tool: {
          toneMs: 90,
          volume: 0.16,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 1567.98,
          // Tool arguments have few word boundaries, so this voice samples
          // letters instead of following phrases.
          reading: { kind: 'alphabet', every: 8 },
          pitch: {
            kind: 'scalar',
            scale: MAJOR_PENTATONIC,
            octaves: 1,
            mapping: 'fold'
          }
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
          toneMs: 70,
          volume: 0.14,
          material: 'wood',
          touch: 'soft',
          // Vowels carry the line; consonants are the noise you do not want in
          // a shared room.
          reading: { kind: 'vowels', every: 3 },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 2,
            mapping: 'fold'
          }
        },
        thinking: {
          toneMs: 110,
          volume: 0.1,
          material: 'wood',
          touch: 'soft',
          reading: { kind: 'vowels', every: 4 },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 2,
            mapping: 'fold'
          }
        },
        tool: { enabled: false, material: 'wood', touch: 'soft' }
      }
    }
  },

  // `phrase` with nothing in its way: long tones, a low pace floor, and a wide
  // drift. One note per word, so the melody is the sentence and the rests are
  // the words.
  haiku: {
    description: 'One held note per word. Prose becomes a slow melodic line.',
    patch: {
      minIntervalMs: 60,
      voices: {
        text: {
          toneMs: 520,
          decay: 0.45,
          volume: 0.3,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 392,
          // The widest span of any preset: seven degrees, so the length of a
          // word reads clearly as the size of a leap.
          reading: { kind: 'phrase', span: 7 },
          pitch: {
            kind: 'scalar',
            scale: HIRAJOSHI,
            octaves: 2,
            mapping: 'fold'
          }
        },
        thinking: {
          toneMs: 700,
          decay: 0.35,
          volume: 0.24,
          material: 'glass',
          touch: 'soft',
          // An octave below the text voice, in its mode: this preset is one
          // instrument with three registers, not three instruments.
          baseFrequency: 196,
          reading: { kind: 'phrase', span: 5 },
          pitch: {
            kind: 'scalar',
            scale: HIRAJOSHI,
            octaves: 2,
            mapping: 'fold'
          }
        },
        tool: {
          toneMs: 700,
          decay: 0.4,
          volume: 0.08,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 783.99,
          // Tool arguments have almost no word boundaries, so this voice
          // samples letters instead of pretending to have phrases. The rate and
          // the tone length are set together: what makes this preset sound like
          // a room is tones overlapping their own tails, and a sparse voice with
          // short tones stays outside that no matter what scale it uses.
          reading: { kind: 'alphabet', every: 4 },
          pitch: {
            kind: 'scalar',
            scale: HIRAJOSHI,
            octaves: 1,
            mapping: 'fold'
          }
        }
      }
    }
  },

  // `phrase` against `drone`: the reading keeps the structure and the pitch
  // throws away every melodic choice. What is left is the raw rhythm of
  // writing — one beat per word, and the length of each word as silence.
  pulse: {
    description: 'One beat per word, one pitch. The heartbeat of the writing.',
    patch: {
      minIntervalMs: 50,
      voices: {
        text: {
          toneMs: 90,
          decay: 1.4,
          volume: 0.3,
          material: 'wood',
          touch: 'normal',
          baseFrequency: 293.66,
          // `drone` reads no index, so the drift has nowhere to go.
          reading: { kind: 'phrase', span: 1 },
          pitch: { kind: 'drone' }
        },
        thinking: {
          toneMs: 130,
          decay: 1.2,
          volume: 0.26,
          material: 'wood',
          touch: 'soft',
          baseFrequency: 146.83,
          reading: { kind: 'phrase', span: 1 },
          pitch: { kind: 'drone' }
        },
        tool: {
          toneMs: 22,
          volume: 0.16,
          material: 'stone',
          touch: 'firm',
          baseFrequency: 587.33,
          reading: { kind: 'class', every: 6 },
          pitch: { kind: 'drone' }
        }
      }
    }
  },

  // `vowels` is the only reading that thins prose without sampling it: it keeps
  // every vowel and drops every consonant, which is the part of a word a singer
  // holds. One octave, so the line never leaps.
  plainchant: {
    description: 'Vowels only, held in one octave. The text sings its spine.',
    patch: {
      minIntervalMs: 220,
      voices: {
        text: {
          toneMs: 620,
          decay: 0.3,
          volume: 0.3,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 196,
          reading: { kind: 'vowels', every: 2 },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 1,
            mapping: 'fold'
          }
        },
        thinking: {
          toneMs: 780,
          decay: 0.25,
          volume: 0.24,
          material: 'wood',
          touch: 'soft',
          baseFrequency: 130.81,
          reading: { kind: 'vowels', every: 3 },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 1,
            mapping: 'fold'
          }
        },
        // A chant does not tick through JSON.
        tool: { enabled: false, material: 'wood', touch: 'soft' }
      }
    }
  },

  // `alphabet` against `chromatic`, one blip per letter and no scale to hide
  // behind: pitch rises strictly with the alphabet over 26 semitones. Repeated
  // letters are unmistakable, and you can hear a word being spelled.
  cipher: {
    description: 'A semitone for each letter. You can hear the spelling.',
    patch: {
      minIntervalMs: 36,
      voices: {
        text: {
          toneMs: 40,
          volume: 0.26,
          material: 'ceramic',
          touch: 'normal',
          baseFrequency: 196,
          reading: { kind: 'alphabet', every: 1 },
          pitch: { kind: 'chromatic', span: 26 }
        },
        thinking: {
          toneMs: 60,
          volume: 0.22,
          material: 'wood',
          touch: 'soft',
          baseFrequency: 98,
          reading: { kind: 'alphabet', every: 2 },
          pitch: { kind: 'chromatic', span: 26 }
        },
        tool: {
          toneMs: 20,
          volume: 0.18,
          material: 'glass',
          touch: 'firm',
          baseFrequency: 392,
          reading: { kind: 'alphabet', every: 4 },
          pitch: { kind: 'chromatic', span: 12 }
        }
      }
    }
  },

  // `class` against `drone`: the reading voices everything except whitespace,
  // and the pitch refuses to vary. Only the gaps between words carry anything,
  // which is exactly what a telegraph line sounds like.
  telegraph: {
    description: 'A wire. Every character a tick, only the spaces speak.',
    patch: {
      minIntervalMs: 28,
      voices: {
        text: {
          toneMs: 14,
          decay: 1.8,
          volume: 0.24,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 659.25,
          reading: { kind: 'class', every: 1 },
          pitch: { kind: 'drone' }
        },
        thinking: {
          toneMs: 18,
          decay: 1.6,
          volume: 0.2,
          material: 'stone',
          touch: 'soft',
          baseFrequency: 440,
          reading: { kind: 'class', every: 2 },
          pitch: { kind: 'drone' }
        },
        tool: {
          toneMs: 10,
          decay: 2,
          volume: 0.16,
          material: 'stone',
          touch: 'firm',
          baseFrequency: 880,
          reading: { kind: 'class', every: 2 },
          pitch: { kind: 'drone' }
        }
      }
    }
  },

  // `codepoint` against `chromatic`, with the tool voice at every character:
  // brackets, quotes and colons all sound, so the shape of a JSON payload is
  // audible. The one preset that makes tool arguments the main voice.
  hexdump: {
    description: 'Raw bytes. Punctuation sounds, and tool calls lead.',
    patch: {
      minIntervalMs: 30,
      voices: {
        text: {
          toneMs: 26,
          volume: 0.22,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 261.63,
          reading: { kind: 'codepoint', span: 24, every: 2 },
          pitch: { kind: 'chromatic', span: 12 }
        },
        thinking: {
          toneMs: 34,
          volume: 0.18,
          material: 'wood',
          touch: 'normal',
          baseFrequency: 130.81,
          reading: { kind: 'codepoint', span: 24, every: 3 },
          pitch: { kind: 'chromatic', span: 12 }
        },
        tool: {
          toneMs: 16,
          volume: 0.26,
          material: 'glass',
          touch: 'firm',
          baseFrequency: 523.25,
          reading: { kind: 'codepoint', span: 32, every: 1 },
          pitch: { kind: 'chromatic', span: 24 }
        }
      }
    }
  },

  sans: sansPreset
}
