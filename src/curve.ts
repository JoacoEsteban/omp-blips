import { match } from 'ts-pattern'

export interface Curve {
  readonly fractions: readonly number[]
  readonly values: readonly number[]
}

export const spread = (values: readonly number[]): Curve => ({
  fractions: values.map((_, index) => index / Math.max(1, values.length - 1)),
  values
})

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

export const constant = (value: number): Curve => ({
  fractions: [0],
  values: [value]
})

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
