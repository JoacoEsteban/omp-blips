import { match, P } from "ts-pattern"
import type { VoiceConfig } from "./config.ts"

const CODE_a = 97
const CODE_z = 122
const CODE_0 = 48
const CODE_9 = 57

const LETTER_DEGREES = CODE_z - CODE_a + 1

/**
 * Character -> scale degree. Letters ascend alphabetically, digits continue
 * above them, everything else (whitespace, punctuation) is silent so the
 * rhythm follows words instead of hammering a constant tone.
 */
const degreeFromCharacter = (char: string): number | undefined =>
  match(char.toLowerCase().codePointAt(0))
    .with(P.number.between(CODE_a, CODE_z), (code) => code - CODE_a)
    .with(P.number.between(CODE_0, CODE_9), (code) => LETTER_DEGREES + (code - CODE_0))
    .otherwise(() => undefined)

/** Frequency in Hz for a character, or `undefined` when the character is silent. */
export const pitchFromCharacter = (
  char: string,
  { baseFrequency, scale, octaves }: VoiceConfig,
): number | undefined =>
  match(degreeFromCharacter(char))
    .with(P.number, (degree) => {
      const slot = degree % (scale.length * octaves)
      const octave = Math.floor(slot / scale.length)
      const semitone = scale[slot % scale.length] ?? 0
      return baseFrequency * 2 ** ((semitone + 12 * octave) / 12)
    })
    .otherwise(() => undefined)
