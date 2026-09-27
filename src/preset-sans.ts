import type { Preset } from './presets.ts'

export const sansPreset: Preset = {
  description:
    'A rising vocal blip. Rounded low tones, one for each character.',
  patch: {
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
        baseFrequency: 123.47,
        material: 'vocal',
        touch: 'soft',
        reading: { kind: 'class' },
        pitch: { kind: 'drone' }
      },
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
