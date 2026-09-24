import { match } from 'ts-pattern'

/**
 * Values sampled along a tone, at ascending fractions of its length. A curve
 * is always built through one of the constructors below, so the knots and
 * the values cannot drift apart: every constructor either derives the knots
 * from the values or checks the two against each other at compile time.
 */
export interface Curve {
  readonly fractions: readonly number[]
  readonly values: readonly number[]
}

/** Values spread evenly from the start of the tone to its end. */
export const spread = (values: readonly number[]): Curve => ({
  fractions: values.map((_, index) => index / Math.max(1, values.length - 1)),
  values
})

/**
 * Values measured at a fixed cadence in real time: the first at `startMs`,
 * one every `everyMs` after it, over a tone of `durationMs`. The knots come
 * from the count of values, so a measurement dropped from the list moves the
 * grid with it.
 */
export const measured =
  (window: {
    readonly startMs: number
    readonly everyMs: number
    readonly durationMs: number
  }) =>
  (values: readonly number[]): Curve => ({
    fractions: values.map(
      (_, index) =>
        (window.startMs + window.everyMs * index) / window.durationMs
    ),
    values
  })

/** One value for the whole tone. */
export const constant = (value: number): Curve => ({
  fractions: [0],
  values: [value]
})

/** The value at `fraction` of the tone, linear between knots, clamped at the ends. */
export const at = (curve: Curve, fraction: number): number => {
  const { fractions, values } = curve
  const firstValue = values[0]
  if (firstValue === undefined) return 0
  const lastIndex = fractions.length - 1
  const firstFraction = fractions[0] ?? 0
  const lastFraction = fractions[lastIndex] ?? firstFraction
  const lastValue = values[lastIndex] ?? firstValue
  if (fraction <= firstFraction) return firstValue
  if (fraction >= lastFraction) return lastValue
  let upperIndex = 1
  while ((fractions[upperIndex] ?? lastFraction) < fraction) upperIndex += 1
  const lowerIndex = upperIndex - 1
  const lowerFraction = fractions[lowerIndex] ?? firstFraction
  const upperFraction = fractions[upperIndex] ?? lastFraction
  const lowerValue = values[lowerIndex] ?? firstValue
  const upperValue = values[upperIndex] ?? lastValue
  const span = upperFraction - lowerFraction
  const t = match(span)
    .with(0, () => 0)
    .otherwise(() => (fraction - lowerFraction) / span)
  return lowerValue + (upperValue - lowerValue) * t
}
