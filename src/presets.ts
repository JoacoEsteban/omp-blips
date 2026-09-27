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
  'geiger',
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
    patch: {
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: 'aeiouAEIOU', at: -0.12 },
                { chars: '0123456789', at: 0.18 }
              ],
              otherwise: 0
            }
          }
        },
        thinking: {
          spatial: {
            placement: { kind: 'fixed', at: -0.25 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.08,
              periodMs: 12000
            }
          }
        },
        tool: {
          spatial: { placement: { kind: 'alternate', positions: [0.25, 0.4] } }
        }
      }
    }
  },

  // Bright modal tones with small intervals and a fast rate. The 2-character
  // rate makes prose sound like a text crawl.
  arcade: {
    description:
      'Bright modal tones. Fast, high, small sounds in a text crawl.',
    patch: {
      tickHz: 22.2,
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'alternate',
              positions: [-0.65, 0.2, 0.65, -0.2]
            }
          },
          divisor: 1,
          stride: 2,
          toneMs: 34,
          volume: 0.28,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 440,
          reading: { kind: 'alphabet' },
          pitch: {
            kind: 'scalar',
            scale: MAJOR_PENTATONIC,
            octaves: 3,
            mapping: 'wrap'
          }
        },
        thinking: {
          spatial: {
            placement: { kind: 'alternate', positions: [0.35, -0.35] }
          },
          divisor: 1,
          stride: 3,
          toneMs: 40,
          volume: 0.24,
          material: 'wood',
          touch: 'normal',
          baseFrequency: 220,
          reading: { kind: 'alphabet' },
          pitch: { kind: 'scalar', scale: BLUES, octaves: 2, mapping: 'wrap' }
        },
        tool: {
          spatial: {
            placement: { kind: 'alternate', positions: [-0.85, 0.85] }
          },
          divisor: 1,
          stride: 4,
          toneMs: 18,
          volume: 0.2,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 880,
          // Dense JSON read character by character, semitones apart: an arcade
          // machine reporting progress, not a melody.
          reading: { kind: 'codepoint', span: 16 },
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
      tickHz: 6.7,
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'alternate',
              positions: [-0.6, 0.15, 0.6, -0.15]
            }
          },
          divisor: 1,
          stride: 10,
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
          spatial: {
            placement: { kind: 'fixed', at: -0.15 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.35,
              periodMs: 7000
            }
          },
          divisor: 1,
          stride: 4,
          toneMs: 420,
          volume: 0.26,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 155.56,
          reading: { kind: 'phrase', span: 3 },
          pitch: { kind: 'scalar', scale: KUMOI, octaves: 2, mapping: 'fold' }
        },
        tool: {
          spatial: {
            placement: { kind: 'alternate', positions: [-0.75, 0.75] }
          },
          divisor: 1,
          stride: 10,
          toneMs: 130,
          volume: 0.18,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 830.61,
          // One struck pitch under the tails of the other two voices.
          reading: { kind: 'class' },
          pitch: { kind: 'drone' }
        }
      }
    }
  },

  // One octave, very sparse, very slow. You stop hearing letters and start
  // hearing whether the agent is alive.
  sonar: {
    description: 'Submarine. One slow ping each few words, nothing else.',
    patch: {
      tickHz: 2.4,
      voices: {
        text: {
          spatial: {
            placement: { kind: 'fixed', at: 0 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.8,
              periodMs: 9000
            }
          },
          divisor: 1,
          stride: 5,
          toneMs: 680,
          decay: 0.25,
          volume: 0.34,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 174.61,
          // Vowels only, on one pitch: a ping per few words, and nothing in
          // between. Consonants would make it a melody again.
          reading: { kind: 'vowels' },
          pitch: { kind: 'drone' }
        },
        thinking: {
          spatial: {
            placement: { kind: 'fixed', at: 0 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.55,
              periodMs: 13000
            }
          },
          divisor: 1,
          stride: 6,
          toneMs: 840,
          decay: 0.25,
          volume: 0.3,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 98,
          reading: { kind: 'vowels' },
          pitch: { kind: 'drone' }
        },
        tool: {
          spatial: {
            placement: { kind: 'fixed', at: -0.3 },
            motion: {
              kind: 'oscillate',
              clock: 'tone',
              depth: 0.6,
              periodMs: 1600
            }
          },
          divisor: 1,
          stride: 6,
          toneMs: 520,
          decay: 0.3,
          volume: 0.24,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 261.63,
          reading: { kind: 'vowels' },
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
      tickHz: 23.8,
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: 'qwertasdfgzxcvbQWERTASDFGZXCVB12345', at: -0.4 },
                { chars: 'yuiophjklnmYUIOPHJKLNM67890', at: 0.4 }
              ],
              otherwise: 0
            }
          },
          divisor: 1,
          stride: 2,
          toneMs: 20,
          volume: 0.22,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 987.77,
          // Four character classes over two semitones: the pitch barely moves,
          // so the ear hears the keys and not the letters.
          reading: { kind: 'class' },
          pitch: { kind: 'chromatic', span: 2 }
        },
        thinking: {
          spatial: { placement: { kind: 'fixed', at: -0.3 } },
          divisor: 1,
          stride: 3,
          toneMs: 24,
          volume: 0.18,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 493.88,
          reading: { kind: 'class' },
          pitch: { kind: 'chromatic', span: 2 }
        },
        tool: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: '{[(', at: -0.55 },
                { chars: '}])', at: 0.55 }
              ],
              otherwise: 0.15
            }
          },
          divisor: 1,
          stride: 3,
          toneMs: 16,
          volume: 0.2,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 1318.51,
          reading: { kind: 'class' },
          pitch: { kind: 'drone' }
        }
      }
    }
  },

  // High, sweet, stepwise. `fold` eachwhere, because leaps break the illusion.
  'music-box': {
    description: 'Wind-up music box. High, sweet, stepwise phrases.',
    patch: {
      tickHz: 10.5,
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'alternate',
              positions: [-0.5, -0.25, 0, 0.25, 0.5, 0.25, 0, -0.25]
            }
          },
          divisor: 1,
          stride: 3,
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
          spatial: {
            placement: { kind: 'fixed', at: 0.15 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.2,
              periodMs: 6000
            }
          },
          divisor: 1,
          stride: 4,
          toneMs: 210,
          volume: 0.22,
          material: 'ceramic',
          touch: 'soft',
          baseFrequency: 523.25,
          reading: { kind: 'phrase', span: 6 },
          pitch: { kind: 'scalar', scale: KUMOI, octaves: 2, mapping: 'fold' }
        },
        tool: {
          spatial: { placement: { kind: 'alternate', positions: [0.6, -0.6] } },
          divisor: 1,
          stride: 8,
          toneMs: 90,
          volume: 0.16,
          material: 'glass',
          touch: 'normal',
          baseFrequency: 1567.98,
          // Tool arguments have few word boundaries, so this voice samples
          // letters instead of following phrases.
          reading: { kind: 'alphabet' },
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
      tickHz: 5.3,
      voices: {
        text: {
          spatial: {
            placement: { kind: 'fixed', at: 0 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.12,
              periodMs: 18000
            }
          },
          divisor: 1,
          stride: 3,
          toneMs: 70,
          volume: 0.14,
          material: 'wood',
          touch: 'soft',
          // Vowels carry the line; consonants are the noise you do not want in
          // a shared room.
          reading: { kind: 'vowels' },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 2,
            mapping: 'fold'
          }
        },
        thinking: {
          spatial: { placement: { kind: 'fixed', at: -0.15 } },
          divisor: 1,
          stride: 4,
          toneMs: 110,
          volume: 0.1,
          material: 'wood',
          touch: 'soft',
          reading: { kind: 'vowels' },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 2,
            mapping: 'fold'
          }
        },
        tool: {
          spatial: { placement: { kind: 'fixed', at: 0.15 } },
          enabled: false,
          divisor: 1,
          stride: 8,
          material: 'wood',
          touch: 'soft'
        }
      }
    }
  },

  // `phrase` with nothing in its way: long tones, a low pace floor, and a wide
  // drift. One note per word, so the melody is the sentence and the rests are
  // the words.
  haiku: {
    description: 'One held note per word. Prose becomes a slow melodic line.',
    patch: {
      tickHz: 16.7,
      voices: {
        text: {
          spatial: {
            placement: { kind: 'fixed', at: -0.15 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.4,
              periodMs: 11000
            }
          },
          divisor: 1,
          stride: 3,
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
          spatial: {
            placement: { kind: 'fixed', at: 0.2 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.35,
              periodMs: 17000
            }
          },
          divisor: 1,
          stride: 4,
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
          spatial: {
            placement: { kind: 'alternate', positions: [-0.65, 0.65] },
            motion: {
              kind: 'oscillate',
              clock: 'tone',
              depth: 0.12,
              periodMs: 2800
            }
          },
          divisor: 1,
          stride: 4,
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
          reading: { kind: 'alphabet' },
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
  // throws away each melodic choice. What is left is the raw rhythm of
  // writing — one beat per word, and the length of each word as silence.
  pulse: {
    description: 'One beat per word, one pitch. The heartbeat of the writing.',
    patch: {
      tickHz: 20,
      voices: {
        text: {
          spatial: { placement: { kind: 'alternate', positions: [-0.2, 0.2] } },
          divisor: 1,
          stride: 6,
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
          spatial: { placement: { kind: 'fixed', at: 0 } },
          divisor: 1,
          stride: 4,
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
          spatial: {
            placement: { kind: 'alternate', positions: [-0.55, 0.55] }
          },
          divisor: 1,
          stride: 6,
          toneMs: 22,
          volume: 0.16,
          material: 'stone',
          touch: 'firm',
          baseFrequency: 587.33,
          reading: { kind: 'class' },
          pitch: { kind: 'drone' }
        }
      }
    }
  },

  // `vowels` is the only reading that thins prose without sampling it: it keeps
  // each vowel and drops each consonant, which is the part of a word a singer
  // holds. One octave, so the line never leaps.
  plainchant: {
    description: 'Vowels only, held in one octave. The text sings its spine.',
    patch: {
      tickHz: 4.5,
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: 'aeAE', at: -0.35 },
                { chars: 'ouOU', at: 0.35 }
              ],
              otherwise: 0
            }
          },
          divisor: 1,
          stride: 2,
          toneMs: 620,
          decay: 0.3,
          volume: 0.3,
          material: 'glass',
          touch: 'soft',
          baseFrequency: 196,
          reading: { kind: 'vowels' },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 1,
            mapping: 'fold'
          }
        },
        thinking: {
          spatial: {
            placement: { kind: 'fixed', at: -0.2 },
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.08,
              periodMs: 14000
            }
          },
          divisor: 1,
          stride: 3,
          toneMs: 780,
          decay: 0.25,
          volume: 0.24,
          material: 'wood',
          touch: 'soft',
          baseFrequency: 130.81,
          reading: { kind: 'vowels' },
          pitch: {
            kind: 'scalar',
            scale: MINOR_PENTATONIC,
            octaves: 1,
            mapping: 'fold'
          }
        },
        // A chant does not tick through JSON.
        tool: {
          spatial: { placement: { kind: 'fixed', at: 0.3 } },
          enabled: false,
          divisor: 1,
          stride: 8,
          material: 'wood',
          touch: 'soft'
        }
      }
    }
  },

  // `alphabet` against `chromatic`, one blip per letter and no scale to hide
  // behind: pitch rises strictly with the alphabet over 26 semitones. Repeated
  // letters are unmistakable, and you can hear a word being spelled.
  cipher: {
    description: 'A semitone for each letter. You can hear the spelling.',
    patch: {
      tickHz: 27.8,
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: 'abcdefghijklmABCDEFGHIJKLM', at: -0.7 },
                { chars: 'nopqrstuvwxyzNOPQRSTUVWXYZ', at: 0.7 }
              ],
              otherwise: 0
            }
          },
          divisor: 1,
          stride: 1,
          toneMs: 40,
          volume: 0.26,
          material: 'ceramic',
          touch: 'normal',
          baseFrequency: 196,
          reading: { kind: 'alphabet' },
          pitch: { kind: 'chromatic', span: 26 }
        },
        thinking: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: 'abcdefghijklmABCDEFGHIJKLM', at: 0.4 },
                { chars: 'nopqrstuvwxyzNOPQRSTUVWXYZ', at: -0.4 }
              ],
              otherwise: 0
            }
          },
          divisor: 1,
          stride: 2,
          toneMs: 60,
          volume: 0.22,
          material: 'wood',
          touch: 'soft',
          baseFrequency: 98,
          reading: { kind: 'alphabet' },
          pitch: { kind: 'chromatic', span: 26 }
        },
        tool: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [{ chars: '0123456789', at: -0.65 }],
              otherwise: 0.4
            }
          },
          divisor: 1,
          stride: 4,
          toneMs: 20,
          volume: 0.18,
          material: 'glass',
          touch: 'firm',
          baseFrequency: 392,
          reading: { kind: 'alphabet' },
          pitch: { kind: 'chromatic', span: 12 }
        }
      }
    }
  },

  // `class` against `drone`: the reading voices eachthing except whitespace,
  // and the pitch refuses to vary. Only the gaps between words carry anything,
  // which is exactly what a telegraph line sounds like.
  telegraph: {
    description: 'A wire. Every character a tick, only the spaces speak.',
    patch: {
      tickHz: 35.7,
      voices: {
        text: {
          spatial: { placement: { kind: 'fixed', at: -0.45 } },
          divisor: 1,
          stride: 1,
          toneMs: 14,
          decay: 1.8,
          volume: 0.24,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 659.25,
          reading: { kind: 'class' },
          pitch: { kind: 'drone' }
        },
        thinking: {
          spatial: { placement: { kind: 'fixed', at: 0.45 } },
          divisor: 1,
          stride: 2,
          toneMs: 18,
          decay: 1.6,
          volume: 0.2,
          material: 'stone',
          touch: 'soft',
          baseFrequency: 440,
          reading: { kind: 'class' },
          pitch: { kind: 'drone' }
        },
        tool: {
          spatial: {
            placement: { kind: 'alternate', positions: [-0.85, 0.85] }
          },
          divisor: 1,
          stride: 2,
          toneMs: 10,
          decay: 2,
          volume: 0.16,
          material: 'stone',
          touch: 'firm',
          baseFrequency: 880,
          reading: { kind: 'class' },
          pitch: { kind: 'drone' }
        }
      }
    }
  },

  // The fastest reading the audio path allows. The mixer writes in 10 ms
  // blocks, so 100 Hz is one tone per block and the hard ceiling of the grid:
  // above it two tones would land in the same block and one would be lost.
  // Every voice takes every grapheme at that rate, so a stream arriving under
  // the grid is heard grapheme by grapheme. Deltas do not arrive evenly, so a
  // burst at the grid rate already outruns it and the catch-up stride starts
  // skipping: at 50 characters a second every voiced grapheme sounds, at 100
  // about two in three do.
  // Tones are shorter than the period, so each one is a tick and not a drone.
  geiger: {
    description: 'One tick for each character, as fast as the grid goes.',
    patch: {
      tickHz: 100,
      voices: {
        text: {
          spatial: { placement: { kind: 'fixed', at: -0.2 } },
          divisor: 1,
          stride: 1,
          toneMs: 6,
          decay: 2.4,
          volume: 0.45,
          material: 'stone',
          touch: 'firm',
          baseFrequency: 1046.5,
          // Four classes, four semitones: vowels, consonants, digits and
          // punctuation are told apart without the tick becoming a melody.
          reading: { kind: 'class' },
          pitch: { kind: 'chromatic', span: 4 }
        },
        thinking: {
          spatial: { placement: { kind: 'fixed', at: 0.25 } },
          divisor: 1,
          stride: 1,
          toneMs: 7,
          decay: 2.2,
          volume: 0.4,
          material: 'wood',
          touch: 'firm',
          baseFrequency: 523.25,
          reading: { kind: 'class' },
          pitch: { kind: 'chromatic', span: 4 }
        },
        tool: {
          spatial: {
            placement: { kind: 'alternate', positions: [-0.75, 0.75] }
          },
          divisor: 1,
          stride: 1,
          toneMs: 5,
          decay: 2.6,
          volume: 0.3,
          material: 'glass',
          touch: 'firm',
          baseFrequency: 1567.98,
          reading: { kind: 'class' },
          pitch: { kind: 'chromatic', span: 4 }
        }
      }
    }
  },

  // `codepoint` against `chromatic`, with the tool voice at each character:
  // brackets, quotes and colons all sound, so the shape of a JSON payload is
  // audible. The one preset that makes tool arguments the main voice.
  hexdump: {
    description: 'Raw bytes. Punctuation sounds, and tool calls lead.',
    patch: {
      tickHz: 33.3,
      voices: {
        text: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: '0123456789', at: 0.45 },
                { chars: '{}[]():,;"', at: -0.45 }
              ],
              otherwise: 0
            }
          },
          divisor: 1,
          stride: 2,
          toneMs: 26,
          volume: 0.22,
          material: 'ceramic',
          touch: 'firm',
          baseFrequency: 261.63,
          reading: { kind: 'codepoint', span: 24 },
          pitch: { kind: 'chromatic', span: 12 }
        },
        thinking: {
          spatial: {
            placement: { kind: 'alternate', positions: [-0.25, 0.25] }
          },
          divisor: 1,
          stride: 3,
          toneMs: 34,
          volume: 0.18,
          material: 'wood',
          touch: 'normal',
          baseFrequency: 130.81,
          reading: { kind: 'codepoint', span: 24 },
          pitch: { kind: 'chromatic', span: 12 }
        },
        tool: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: '{[(', at: -1 },
                { chars: '}])', at: 1 },
                { chars: '"', at: -0.3 },
                { chars: ':,;', at: 0.3 }
              ],
              otherwise: 0
            }
          },
          divisor: 1,
          stride: 1,
          toneMs: 16,
          volume: 0.26,
          material: 'glass',
          touch: 'firm',
          baseFrequency: 523.25,
          reading: { kind: 'codepoint', span: 32 },
          pitch: { kind: 'chromatic', span: 24 }
        }
      }
    }
  },

  sans: sansPreset
}
