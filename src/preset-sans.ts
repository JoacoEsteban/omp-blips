import type { Preset } from './presets.ts'

/**
 * The `vocal` material: the fitted Sans voice, rounded and low. The renderer
 * supplies the rise and the cycle motion, so the preset only has to place the
 * voice in a register and decide how often it speaks.
 */
export const sansPreset: Preset = {
  description:
    'A rising vocal blip. Rounded low tones, one for each character.',
  patch: {
    // Keep the character cadence independent of the longer vocal envelope.
    tickHz: 15.2,
    voices: {
      text: {
        spatial: {
          placement: {
            kind: 'characters',
            groups: [{ chars: 'aeiouAEIOU', at: -0.12 }],
            otherwise: 0.08
          }
        },
        divisor: 1,
        stride: 1,
        toneMs: 140,
        decay: 5,
        // A short rise, a held body, then a fade across the second half.
        swell: 0.15,
        hold: 0.5,
        glide: 0,
        volume: 0.3,
        material: 'vocal',
        touch: 'normal',
        baseFrequency: 164.81,
        reading: { kind: 'class' },
        pitch: { kind: 'drone' }
      },
      thinking: {
        spatial: {
          placement: { kind: 'fixed', at: -0.25 },
          motion: {
            kind: 'oscillate',
            clock: 'voice',
            depth: 0.07,
            periodMs: 8000
          }
        },
        divisor: 1,
        stride: 2,
        toneMs: 140,
        decay: 5,
        swell: 0.15,
        hold: 0.5,
        glide: 0,
        volume: 0.24,
        // A fourth below the text voice, at half the rate: the same mouth,
        // talking to itself, quieter and with a softer attack.
        baseFrequency: 123.47,
        material: 'vocal',
        touch: 'soft',
        reading: { kind: 'class' },
        pitch: { kind: 'drone' }
      },
      // Not speech: a dry knock under the voice, and the one struck sound in
      // the preset.
      tool: {
        spatial: { placement: { kind: 'fixed', at: 0.5 } },
        divisor: 1,
        stride: 3,
        toneMs: 28,
        decay: 1.5,
        swell: 0,
        hold: 0,
        glide: 0,
        volume: 0.2,
        material: 'stone',
        touch: 'firm',
        baseFrequency: 146.83,
        reading: { kind: 'class' },
        pitch: { kind: 'drone' }
      }
    }
  }
}
