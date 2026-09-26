import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from './config.ts'
import { loadSettings } from './settings.ts'
import type { SpatialConfig } from './spatial.ts'

const withConfig = <T>(raw: object, read: (cwd: string) => T): T => {
  const serialized = JSON.stringify(raw)
  if (serialized === undefined) throw new Error('fixture must serialize')
  const cwd = mkdtempSync(join(tmpdir(), 'omp-blips-'))
  const previous = process.env['PI_CODING_AGENT_DIR']
  process.env['PI_CODING_AGENT_DIR'] = cwd
  try {
    writeFileSync(join(cwd, 'blips.json'), serialized)
    return read(cwd)
  } finally {
    if (previous === undefined) delete process.env['PI_CODING_AGENT_DIR']
    else process.env['PI_CODING_AGENT_DIR'] = previous
    rmSync(cwd, { recursive: true, force: true })
  }
}

const INVALID_SPATIAL = [
  {
    name: 'out-of-range pan',
    spatial: { placement: { kind: 'fixed', at: 2 } }
  },
  {
    name: 'empty alternation',
    spatial: { placement: { kind: 'alternate', positions: [] } }
  },
  {
    name: 'zero motion period',
    spatial: {
      placement: { kind: 'fixed', at: 0 },
      motion: { kind: 'oscillate', clock: 'tone', depth: 0.5, periodMs: 0 }
    }
  }
]

for (const { name, spatial } of INVALID_SPATIAL)
  test(`invalid spatial ${name} is rejected without partial application`, () => {
    const settings = withConfig(
      { voices: { text: { spatial, volume: 0.1 } } },
      (cwd) => loadSettings(cwd)
    )
    expect(settings.problems.length).toBeGreaterThan(0)
    expect(settings.config.voices.text.spatial).toEqual(
      defaultConfig.voices.text.spatial
    )
    expect(settings.config.voices.text.volume).toBe(
      defaultConfig.voices.text.volume
    )
  })

test('valid nested spatial configuration is loaded', () => {
  const spatial: SpatialConfig = {
    placement: {
      kind: 'characters',
      groups: [{ chars: 'a', at: -0.5 }],
      otherwise: 0.5
    },
    motion: {
      kind: 'oscillate',
      clock: 'voice',
      depth: 0.25,
      periodMs: 800
    }
  }
  const settings = withConfig({ voices: { text: { spatial } } }, (cwd) =>
    loadSettings(cwd)
  )
  expect(settings.problems).toEqual([])
  expect(settings.config.voices.text.spatial).toEqual(spatial)
})
