import { expect, test } from 'bun:test'
import type { Tone } from './types.ts'
import {
  mixerStep,
  openMixer,
  renderSource,
  type Source,
  type StereoFrame
} from './mixer.ts'
const tone = (spatial: Tone['spatial']): Tone => ({
  frequency: 220,
  toneMs: 120,
  decay: 1,
  swell: 0,
  hold: 0,
  glide: 0,
  color: 0.5,
  material: 'wood',
  touch: 'normal',
  volume: 0.5,
  spatial
})

test('stereo sources preserve width at center and both channels at an edge', () => {
  const output: StereoFrame = { left: 0, right: 0 }
  const source: Source = {
    kind: 'stereo',
    left: Float32Array.of(1),
    right: Float32Array.of(0.5)
  }
  renderSource(source, 0, 0, 1, 1, output)
  expect(output.left).toBe(1)
  expect(output.right).toBe(0.5)

  renderSource(source, 0, 1, 0, 1, output)
  expect(output.left).toBe(0)
  expect(output.right).toBe(1.5)
})

test('motion changes stereo gains across the rendered tone', () => {
  const step = mixerStep(Infinity)
  const started = step(openMixer(0), {
    type: 'play',
    tone: tone({
      at: 0,
      motion: { kind: 'oscillate', clock: 'tone', depth: 1, periodMs: 20 }
    }),
    at: 0
  })
  const rendered = step(started, { type: 'tick', at: 0 })
  const block = rendered.block
  if (block === undefined) throw new Error('expected a rendered block')

  let channelDifference = 0
  for (let offset = 0; offset < block.length; offset += 4) {
    channelDifference += Math.abs(
      block.readInt16LE(offset) - block.readInt16LE(offset + 2)
    )
  }
  expect(channelDifference).toBeGreaterThan(0)
})
test('voice motion phase follows the shared monotonic timeline', () => {
  const step = mixerStep(Infinity)
  const render = (openedAt: number): Buffer => {
    const started = step(openMixer(openedAt), {
      type: 'play',
      tone: tone({
        at: 0,
        motion: {
          kind: 'oscillate',
          clock: 'voice',
          depth: 1,
          periodMs: 1000
        }
      }),
      at: openedAt
    })
    const rendered = step(started, { type: 'tick', at: openedAt })
    const block = rendered.block
    if (block === undefined) throw new Error('expected a rendered block')
    return block
  }
  const first = render(250)
  const reopened = render(750)
  let firstLeft = 0
  let firstRight = 0
  let reopenedLeft = 0
  let reopenedRight = 0
  for (let offset = 0; offset < first.length; offset += 4) {
    firstLeft += Math.abs(first.readInt16LE(offset))
    firstRight += Math.abs(first.readInt16LE(offset + 2))
    reopenedLeft += Math.abs(reopened.readInt16LE(offset))
    reopenedRight += Math.abs(reopened.readInt16LE(offset + 2))
  }
  expect(firstRight).toBeGreaterThan(firstLeft)
  expect(reopenedLeft).toBeGreaterThan(reopenedRight)
})

test('flush releases old tones without cutting a newly played tone', () => {
  const step = mixerStep(Infinity)
  const first = step(openMixer(0), {
    type: 'play',
    tone: tone({ at: -1 }),
    at: 0
  })
  const flushed = step(first, { type: 'flush' })
  const added = step(flushed, {
    type: 'play',
    tone: tone({ at: 1 }),
    at: 1
  })
  const rendered = step(added, { type: 'tick', at: 10 })
  const block = rendered.block
  if (block === undefined) throw new Error('expected a rendered block')
  expect(rendered.ringing).toHaveLength(1)
  for (let frame = 300; frame * 4 < block.length; frame += 1)
    expect(block.readInt16LE(frame * 4)).toBe(0)
  let rightAudible = 0
  for (let frame = 0; frame * 4 < block.length; frame += 1)
    rightAudible += Math.abs(block.readInt16LE(frame * 4 + 2))
  expect(rightAudible).toBeGreaterThan(0)
})

test('end drains a natural source instead of cutting it', () => {
  const step = mixerStep(Infinity)
  const started = step(openMixer(0), {
    type: 'play',
    tone: tone({ at: 0 }),
    at: 0
  })
  const ended = step(started, { type: 'end' })
  expect(ended.done).toBe(false)
  expect(ended.ringing).toHaveLength(1)
  const drained = step(ended, { type: 'tick', at: 200 })
  expect(drained.ringing).toHaveLength(0)
  const done = step(drained, { type: 'tick', at: 210 })
  expect(done.done).toBe(true)
})

test('a tone starts at the sample it asked for, not at the head of the block', () => {
  const step = mixerStep(Infinity)
  // One block covering 10 ms of new audio, with a tone due 5 ms into it.
  const opened = step(openMixer(0), { type: 'tick', at: 0 })
  const struck = step(opened, { type: 'play', tone: tone({ at: 0 }), at: 5 })
  const block = step(struck, { type: 'tick', at: 10 }).block
  if (block === undefined) throw new Error('expected a rendered block')

  const energy = (from: number, to: number): number => {
    let total = 0
    for (let frame = from; frame < to; frame += 1)
      total += Math.abs(block.readInt16LE(frame * 4))
    return total
  }
  // 5 ms is 220 frames at 44.1 kHz; the strike lands on the far side of them.
  expect(energy(0, 200)).toBe(0)
  expect(energy(240, 440)).toBeGreaterThan(0)
})

test('two tones inside one tick keep the distance between them', () => {
  const step = mixerStep(Infinity)
  const opened = step(openMixer(0), { type: 'tick', at: 0 })
  const first = step(opened, { type: 'play', tone: tone({ at: 0 }), at: 2 })
  const second = step(first, { type: 'play', tone: tone({ at: 0 }), at: 7 })

  expect(second.ringing.map(({ offset }) => offset)).toEqual([-88, -309])
})
