import { match, P } from 'ts-pattern'
import type { VoiceConfig } from './config.ts'
import { mappings } from './mapping.ts'

const CODE_A = 97
const CODE_Z = 122
const CODE_0 = 48
const CODE_9 = 57

const LETTER_COUNT = CODE_Z - CODE_A + 1

/**
 * Character -> alphabet index. Letters ascend alphabetically, digits continue
 * above them, everything else (whitespace, punctuation) is silent so the
 * rhythm follows words instead of hammering a constant tone.
 */
const indexFromCharacter = (char: string): number | undefined =>
  match(char.toLowerCase().codePointAt(0))
    .with(P.number.between(CODE_A, CODE_Z), (code) => code - CODE_A)
    .with(
      P.number.between(CODE_0, CODE_9),
      (code) => LETTER_COUNT + (code - CODE_0)
    )
    .otherwise(() => undefined)

/** Frequency in Hz for a character, or `undefined` when the character is silent. */
export const pitchFromCharacter = (
  char: string,
  { baseFrequency, scale, octaves, mapping }: VoiceConfig
): number | undefined =>
  match(indexFromCharacter(char))
    .with(P.number, (index) => {
      const slot = mappings[mapping](index, scale.length * octaves)
      const octave = Math.floor(slot / scale.length)
      const semitone = scale[slot % scale.length] ?? 0
      return baseFrequency * 2 ** ((semitone + 12 * octave) / 12)
    })
    .otherwise(() => undefined)
