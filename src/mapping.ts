/**
 * How a character's alphabet index is folded into the scale slots available to
 * a voice. Named presets so a voice can pick its melodic behaviour.
 */
export type MappingName = "wrap" | "fold"

/** `index` is the character's position in the alphabet, `slots` is `scale.length * octaves`. */
export type Mapping = (index: number, slots: number) => number

/**
 * Modulo. Pitch is monotonic in the alphabet, but the wrap point is a cliff:
 * with 15 slots, `o` sits at the top and `p` drops two octaves. English puts
 * common bigrams (`on`, `or`, `no`) right across that seam, so the line leaps.
 */
const wrap: Mapping = (index, slots) => index % slots

/**
 * Zigzag: ascend to the top slot, then descend, then ascend again. Alphabetically
 * adjacent letters are always adjacent degrees, so the melody moves in steps
 * instead of leaping at a seam. Pitch is no longer monotonic in the alphabet —
 * inaudible, since nobody tracks absolute letter order by ear.
 */
const fold: Mapping = (index, slots) => {
 const span = Math.max(1, slots - 1)
 const position = index % (span * 2)
 return position <= span ? position : span * 2 - position
}

export const mappings: Record<MappingName, Mapping> = { wrap, fold }
