import { expect, test } from 'bun:test'
import { arrivalOf } from './arrival.ts'

/** A generator with a seed, so a run of draws is the same every time. */
const seeded = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const reading = (charsPerSecond: number, deltas: number) => {
  const draw = seeded(20_260_927)
  return Array.from({ length: deltas }, () => arrivalOf(charsPerSecond, draw))
}

for (const rate of [1, 100, 250])
  test(`a reading at ${String(rate)} chars/s delivers that many`, () => {
    const arrivals = reading(rate, 20_000)
    const chars = arrivals.reduce((total, { chars }) => total + chars, 0)
    const seconds =
      arrivals.reduce((total, { waitMs }) => total + waitMs, 0) / 1000

    expect(chars / seconds).toBeGreaterThan(rate * 0.99)
    expect(chars / seconds).toBeLessThan(rate * 1.01)
  })

test('a delta carries a run of graphemes, never a paragraph', () => {
  const sizes = reading(100, 20_000).map(({ chars }) => chars)

  expect(Math.min(...sizes)).toBe(1)
  expect(Math.max(...sizes)).toBe(12)
  expect(
    sizes.reduce((total, size) => total + size, 0) / sizes.length
  ).toBeGreaterThan(2)
})

test('the gaps between deltas are uneven', () => {
  const waits = reading(100, 500)
    .filter(({ chars }) => chars === 4)
    .map(({ waitMs }) => waitMs)

  expect(new Set(waits).size).toBe(waits.length)
  expect(Math.min(...waits)).toBeGreaterThanOrEqual(20)
  expect(Math.max(...waits)).toBeLessThanOrEqual(60)
})
