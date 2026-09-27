import { match } from 'ts-pattern'
import type { VoiceConfig } from './config.ts'
import { type MappingName, mappings } from './mapping.ts'

export type PitchConfig =
  | {
      readonly kind: 'scalar'
      readonly scale: readonly number[]
      readonly octaves: number
      readonly mapping: MappingName
    }
  | { readonly kind: 'drone' }
  | { readonly kind: 'chromatic'; readonly span: number }

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
