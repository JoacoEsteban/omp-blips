import { match } from 'ts-pattern'
import type { VoiceConfig } from './config.ts'
import { type MappingName, mappings } from './mapping.ts'

/**
 * How a voice turns a character index into a frequency. `baseFrequency` stays on
 * the voice instead of inside a variant: every realization needs a reference
 * pitch, and it is the one number people reach into a config file to nudge.
 */
export type PitchConfig =
  | {
      readonly kind: 'scalar'
      /** Semitone offsets of one octave of the scale. */
      readonly scale: readonly number[]
      /** How many octaves the character range is spread over. */
      readonly octaves: number
      /** How the character index is folded into the available scale slots. */
      readonly mapping: MappingName
    }
  /** No melody at all: one pitch, however the character reads. */
  | { readonly kind: 'drone' }
  /** Semitone steps with no scale, over a span the ear hears as one gesture. */
  | { readonly kind: 'chromatic'; readonly span: number }

/** Frequency in Hz for a character index, as this voice realizes it. */
export const frequencyOf = (
  index: number,
  { baseFrequency, pitch }: VoiceConfig
): number =>
  match(pitch)
    .with({ kind: 'scalar' }, ({ scale, octaves, mapping }) => {
      const slot = mappings[mapping](index, scale.length * octaves)
      const octave = Math.floor(slot / scale.length)
      const semitone = scale[slot % scale.length] ?? 0
      return baseFrequency * 2 ** ((semitone + 12 * octave) / 12)
    })
    .with({ kind: 'drone' }, () => baseFrequency)
    .with(
      { kind: 'chromatic' },
      ({ span }) => baseFrequency * 2 ** ((index % span) / 12)
    )
    .exhaustive()
