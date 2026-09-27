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
  'psychosis',
  'sans'
] as const

export type PresetName = (typeof PRESET_NAMES)[number]

export interface Preset {
  readonly description: string
  readonly patch: ConfigPatch
}

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
          reading: { kind: 'codepoint', span: 16 },
          pitch: { kind: 'chromatic', span: 7 }
        }
      }
    }
  },

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
          reading: { kind: 'class' },
          pitch: { kind: 'drone' }
        }
      }
    }
  },

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

  // The fastest reading the audio path allows. The mixer places a tone at the
  // sample it was due, not at the head of the block it is writing, so the grid
  // is not bounded by the 10 ms block: 250 ticks a second is faster than any
  // provider streams, and every grapheme of a full-speed answer gets its own
  // tick with the stride never widening.
  //
  // A tone cannot be shorter than the 4 ms period and still be heard. This
  // renderer builds its resonances over the length of the tone, so a 3 ms
  // click peaks around a thirtieth of a 30 ms one, and the ear integrates a
  // burst over far longer than either. These tones are three periods long and
  // overlap by design: what carries the rhythm at this rate is the strike, not
  // the silence between strikes. A soft touch is no use here either — its 8 ms
  // attack is most of the tone — so every voice is struck firm.
  geiger: {
    description: 'One tick for each character, at any speed text arrives.',
    patch: {
      tickHz: 250,
      voices: {
        text: {
          spatial: { placement: { kind: 'fixed', at: -0.2 } },
          divisor: 1,
          stride: 1,
          // A delta carries a token, not a character. The window is wide
          // enough to cross one without the stride ever leaving 1, which is
          // what makes the tick-per-grapheme promise hold through a burst.
          catchup: 32,
          toneMs: 12,
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
          catchup: 32,
          toneMs: 12,
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
          catchup: 32,
          toneMs: 8,
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

  // Two mouths and a needle. The prose and the reasoning are the generic
  // tracts — a harmonic source read through resonances that stay put in Hz
  // while the pitch moves — and all three voices read every grapheme at
  // once: `codepoint`/`class`, stride 1, divisor 1. One character is a
  // syllable said three times over, in three registers that were tuned apart
  // instead of together, and the tones are long enough to still be talking
  // when the next four arrive. What the ear gets is not a rhythm but a crowd.
  //
  // The grid is 125 ticks a second, so the cursor drains faster than any
  // provider streams and `catchup` never has to widen the stride. That rate
  // is a ceiling, not a tempo: what actually sounds is the arrival rate of
  // the text, so ordinary prose overlaps three or four deep and a token
  // dumped all at once surges to thirteen. The mixer rings 32 voices, which
  // is 256 ms of tone across the 8 ms grid; 104 + 88 + 28 fits even when the
  // drain runs flat out, so no character is ever the one that goes missing.
  //
  // Every envelope control is doing work. The prose swells instead of
  // striking and holds before it fades, so each syllable arrives rather than
  // starts; the reasoning swells over almost half its length, which is what
  // makes it impossible to say when it began. The pitch controls disagree on
  // purpose: the prose rises three semitones inside each tone, the reasoning
  // sags nine, and the tool voice drops a tenth like something falling over.
  psychosis: {
    description:
      'Two mouths on every character and a needle over them, none agreeing.',
    patch: {
      tickHz: 125,
      voices: {
        // The answer, read back to you in a mouth that is not yours. `brass`
        // is a source and a filter, and this voice freezes the filter: one
        // held shape for every character, so all the movement is pitch. It
        // is the steady one, and it is only steady next to what is under it.
        text: {
          spatial: {
            placement: {
              kind: 'characters',
              groups: [
                { chars: 'aeiouAEIOU', at: -0.7 },
                { chars: '0123456789', at: 0.8 },
                { chars: '.,;:!?\'"()[]{}', at: 0.45 }
              ],
              otherwise: 0
            },
            // Clocked on the tone, so the movement belongs to the syllable
            // and not to the mix: 120 ms is a sixth of this period, and each
            // utterance slides off the place it started from.
            motion: {
              kind: 'oscillate',
              clock: 'tone',
              depth: 0.55,
              periodMs: 720
            }
          },
          divisor: 1,
          stride: 1,
          catchup: 64,
          toneMs: 104,
          decay: 3.4,
          swell: 0.22,
          hold: 0.3,
          glide: -3,
          volume: 0.18,
          material: 'brass',
          color: { kind: 'fixed', at: 0.35 },
          touch: 'soft',
          baseFrequency: 155.56,
          reading: { kind: 'codepoint', span: 24 },
          pitch: {
            kind: 'scalar',
            scale: HIRAJOSHI,
            octaves: 2,
            mapping: 'fold'
          }
        },
        // The thought underneath, which will not settle. Two cycles run
        // through it at once and neither divides the other: the character
        // picks a note out of 29 through a restless scale that `wrap` sends
        // climbing and snapping back to the bottom, and the same character
        // picks one of 4 mouth shapes. 29 and 4 share no factor, so the pair
        // takes 116 characters to repeat and no utterance is the one before
        // it. Nothing articulates: the swell eats over half the tone, the
        // decay barely falls, and each one sags a major sixth on its way
        // out, so a word arrives as a groan and the groans pile up 11 deep
        // into a cluster that keeps rearranging itself.
        thinking: {
          spatial: {
            placement: { kind: 'fixed', at: 0 },
            // The widest swing of the three, clocked on the mix: it starts in
            // the middle of the head and keeps leaving it, on a period that
            // shares no factor with the prose voice's.
            motion: {
              kind: 'oscillate',
              clock: 'voice',
              depth: 0.95,
              periodMs: 4300
            }
          },
          divisor: 1,
          stride: 1,
          catchup: 64,
          toneMs: 88,
          decay: 0.7,
          swell: 0.55,
          hold: 0,
          glide: 9,
          volume: 0.24,
          material: 'reed',
          color: { kind: 'vowel', span: 4 },
          touch: 'soft',
          baseFrequency: 98,
          reading: { kind: 'codepoint', span: 29 },
          pitch: { kind: 'scalar', scale: BLUES, octaves: 2, mapping: 'wrap' }
        },
        // The interruption, and the one thing here that is not a mouth: a
        // struck needle over the two tracts, falling a tenth inside 32 ms.
        // Six positions rather than two, because an even ping-pong would
        // become a rhythm and this voice is not allowed to become one.
        tool: {
          spatial: {
            placement: {
              kind: 'alternate',
              positions: [-1, 0.6, 1, -0.55, 0.9, -0.85]
            }
          },
          divisor: 1,
          stride: 1,
          catchup: 64,
          toneMs: 28,
          decay: 2.6,
          swell: 0,
          hold: 0.12,
          glide: 16,
          volume: 0.07,
          material: 'glass',
          touch: 'firm',
          baseFrequency: 1479.98,
          reading: { kind: 'codepoint', span: 19 },
          pitch: { kind: 'chromatic', span: 19 }
        }
      }
    }
  },

  sans: sansPreset
}
