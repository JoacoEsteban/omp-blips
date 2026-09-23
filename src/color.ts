import { match, P } from 'ts-pattern'

/**
 * How a character index becomes a vowel colour: where the second formant of a
 * sustained material sits inside its sweep, from 0 to 1. `pitch` answers what
 * note a character is; this answers what mouth shape it is said with, and the
 * two are independent — a vowel keeps its identity at any pitch.
 */
export type ColorConfig =
  /** One mouth shape for every character: a held vowel. */
  | { readonly kind: 'fixed'; readonly at: number }
  /** `span` mouth shapes in rotation, so neighbouring characters differ. */
  | { readonly kind: 'vowel'; readonly span: number }

/**
 * Quantised on purpose: a colour per character index would render and cache a
 * separate tone for every value, and the ear cannot tell two neighbouring
 * mouth shapes apart anyway. `span` shapes is `span` cached tones.
 */
export const colorOf = (index: number, config: ColorConfig): number =>
  match(config)
    .with({ kind: 'fixed' }, ({ at }) => Math.min(1, Math.max(0, at)))
    .with({ kind: 'vowel', span: P.number.lte(1) }, () => 0.5)
    .with({ kind: 'vowel' }, ({ span }) => (index % span) / (span - 1))
    .exhaustive()
