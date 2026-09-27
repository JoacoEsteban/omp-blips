import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { match, P } from 'ts-pattern'
import { loadSettings, saveVoices, settingsPath } from './settings.ts'
import type { SpatialConfig } from './spatial.ts'

/** Runs `read` against a profile directory whose config file holds `raw`. */
const withConfig = <T>(raw: string | object, read: () => T): T => {
  const contents = match(raw)
    .with(P.string, (text) => text)
    .otherwise((value) => JSON.stringify(value))
  if (contents === undefined) throw new Error('fixture must serialize')
  const dir = mkdtempSync(join(tmpdir(), 'omp-blips-'))
  const previous = process.env['PI_CODING_AGENT_DIR']
  process.env['PI_CODING_AGENT_DIR'] = dir
  try {
    writeFileSync(join(dir, 'blips.json'), contents)
    return read()
  } finally {
    if (previous === undefined) delete process.env['PI_CODING_AGENT_DIR']
    else process.env['PI_CODING_AGENT_DIR'] = previous
    rmSync(dir, { recursive: true, force: true })
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
    const baseline = withConfig({}, () => loadSettings().config)
    const settings = withConfig(
      { voices: { text: { spatial, volume: 0.1 } } },
      () => loadSettings()
    )
    expect(settings.problems.length).toBeGreaterThan(0)
    expect(settings.config).toEqual(baseline)
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
  const settings = withConfig({ voices: { text: { spatial } } }, () =>
    loadSettings()
  )
  expect(settings.problems).toEqual([])
  expect(settings.config.voices.text.spatial).toEqual(spatial)
})

test('saved voices join the rest of the file and come back on a reload', () => {
  const settings = withConfig(
    { preset: 'gamelan', voices: { text: { volume: 0.25 } } },
    () => {
      expect(
        saveVoices({ text: false, thinking: true, tool: false })
      ).toBeUndefined()
      return loadSettings()
    }
  )
  expect(settings.problems).toEqual([])
  expect(settings.preset).toBe('gamelan')
  expect(settings.config.voices.text.volume).toBe(0.25)
  expect(settings.config.voices.text.enabled).toBe(false)
  expect(settings.config.voices.thinking.enabled).toBe(true)
  expect(settings.config.voices.tool.enabled).toBe(false)
})

test('a config file that does not parse is reported and left alone', () => {
  const kept = withConfig('{ "preset": ', () => {
    expect(saveVoices({ text: false, thinking: false, tool: false })).toContain(
      'not saved'
    )
    return readFileSync(settingsPath(), 'utf8')
  })
  expect(kept).toBe('{ "preset": ')
})
