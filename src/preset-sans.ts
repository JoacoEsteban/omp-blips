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
    minIntervalMs: 66,
    voices: {
      text: {
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
        reading: { kind: 'class', every: 1 },
        pitch: { kind: 'drone' }
      },
      thinking: {
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
        reading: { kind: 'class', every: 2 },
        pitch: { kind: 'drone' }
      },
      // Not speech: a dry knock under the voice, and the one struck sound in
      // the preset.
      tool: {
        toneMs: 28,
        decay: 1.5,
        swell: 0,
        hold: 0,
        glide: 0,
        volume: 0.2,
        material: 'stone',
        touch: 'firm',
        baseFrequency: 146.83,
        reading: { kind: 'class', every: 3 },
        pitch: { kind: 'drone' }
      }
    }
  }
}
