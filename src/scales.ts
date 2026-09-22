/**
 * Semitone offsets of one octave. Every scale here is gapped (five or six notes,
 * no adjacent semitones in the reachable set), so two blips played together or
 * back to back are never dissonant, whatever the text does.
 */

/** Bright and neutral. The sound most ears read as "melody". */
export const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const

/** The same shape, darker. Used where a voice must sit under another one. */
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10] as const

/** Japanese, half-step at the top of each pair. Metallic, bell-like. */
export const HIRAJOSHI = [0, 2, 3, 7, 8] as const

/** Hirajoshi with an open sixth. Softer, music-box colour. */
export const KUMOI = [0, 2, 3, 7, 9] as const

/** Minor pentatonic plus the flat fifth. Restless, slightly wrong on purpose. */
export const BLUES = [0, 3, 5, 6, 10] as const
