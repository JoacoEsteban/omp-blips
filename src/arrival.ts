/**
 * How a delta reaches the extension. A provider does not send text one
 * character at a time: it sends roughly a token whenever it has one, and the
 * gaps between those deltas are uneven. The picker reads its sample the same
 * way, so what it auditions is the pipeline absorbing bursts and not a
 * metronome walking a string.
 */
export interface Arrival {
  readonly chars: number
  readonly waitMs: number
}

const MEAN_CHARS = 4
/** No provider hands over a paragraph in one delta. */
const MAX_CHARS = 12
/** How far a gap strays from the nominal one, as a fraction of it. */
const JITTER = 0.5

export const arrivalOf = (
  charsPerSecond: number,
  draw: () => number
): Arrival => {
  const chars = Math.min(
    MAX_CHARS,
    Math.max(1, Math.ceil(-Math.log(1 - draw()) * MEAN_CHARS))
  )
  const nominalMs = (chars / charsPerSecond) * 1000

  return { chars, waitMs: nominalMs * (1 - JITTER + 2 * JITTER * draw()) }
}
