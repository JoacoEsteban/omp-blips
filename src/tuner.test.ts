import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRESET_NAMES } from './presets.ts'
import type { Sample, Samples } from './samples.ts'
import { loadSettings } from './settings.ts'
import { advanced, presetOf, stepped, tuningOf, type Tuning } from './tuner.ts'

process.env['PI_CODING_AGENT_DIR'] = mkdtempSync(join(tmpdir(), 'omp-blips-'))

const samples: Samples = {
  of: (kind): Sample => ({ text: `${kind} sample`, problem: '' })
}

const opened = (): Tuning => tuningOf(samples, 'default')

const LAST = PRESET_NAMES[PRESET_NAMES.length - 1] ?? 'default'

const tuningOfStep = (tuning: Tuning, key: 'up' | 'down' | 'left'): Tuning => {
  const step = stepped(tuning, key, samples)
  if (step.type !== 'tune') throw new Error(`${key} closed the tuner`)
  return step.tuning
}

test('the cursor starts on the preset the config file names', () => {
  expect(presetOf(opened())).toBe('default')
})

test('walking off the top of the list wraps to the bottom', () => {
  const moved = tuningOfStep(opened(), 'up')

  expect(presetOf(moved)).toBe(LAST)
  expect(moved.config).toEqual(loadSettings(LAST).config)
})

test('the voice keys move through text, thinking and tool', () => {
  const thinking = tuningOfStep(opened(), 'left')

  expect(thinking.kind).toBe('tool')
  expect(thinking.sample.text).toBe('tool sample')
})

test('keeping a preset answers with the one under the cursor', () => {
  expect(stepped(tuningOfStep(opened(), 'down'), 'enter', samples)).toEqual({
    type: 'close',
    preset: PRESET_NAMES[1] ?? 'default'
  })
})

test('backing out answers with no preset at all', () => {
  expect(stepped(opened(), 'escape', samples)).toEqual({
    type: 'close',
    preset: undefined
  })
})

test('a sample that runs out is replaced, and the reading carries on', () => {
  const read = (tuning: Tuning, characters: number): Tuning =>
    Array.from({ length: characters }).reduce<Tuning>(
      (current) => advanced(current, samples).tuning,
      tuning
    )

  const start = opened()
  const spent = read(start, start.sample.text.length)

  expect(spent.offset).toBe(0)
  expect(spent.streamed).toBe(`${start.sample.text}\n`)
  expect(advanced(spent, samples).char).toBe('t')
})
