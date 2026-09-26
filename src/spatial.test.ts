import { expect, test } from 'bun:test'
import { spatialOf, type SpatialConfig } from './spatial.ts'

test('character placement is case-sensitive and matches complete graphemes', () => {
  const config: SpatialConfig = {
    placement: {
      kind: 'characters',
      groups: [
        { chars: 'e\u0301a', at: -0.25 },
        { chars: 'a', at: 0.75 }
      ],
      otherwise: 0.4
    }
  }
  expect(spatialOf('a', 0, config).at).toBe(-0.25)
  expect(spatialOf('A', 0, config).at).toBe(0.4)
  expect(spatialOf('e', 0, config).at).toBe(0.4)
  expect(spatialOf('e\u0301', 0, config).at).toBe(-0.25)
})

test('alternate placement follows the emitted ordinal', () => {
  const config: SpatialConfig = {
    placement: { kind: 'alternate', positions: [-1, 0, 1] }
  }
  expect(spatialOf('a', 0, config).at).toBe(-1)
  expect(spatialOf('a', 1, config).at).toBe(0)
  expect(spatialOf('a', 3, config).at).toBe(-1)
})
