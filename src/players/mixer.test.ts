import { expect, test } from 'bun:test'
import type { Tone } from './types.ts'
import {
  FRAME_BYTES,
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
    sender: 0,
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
  for (let offset = 0; offset < block.length; offset += FRAME_BYTES) {
    channelDifference += Math.abs(
      block.readFloatLE(offset) - block.readFloatLE(offset + 4)
    )
  }
  expect(channelDifference).toBeGreaterThan(0)
})
test('voice motion phase follows the shared monotonic timeline', () => {
  const step = mixerStep(Infinity)
  const render = (openedAt: number): Buffer => {
    const started = step(openMixer(openedAt), {
      type: 'play',
      sender: 0,
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
  for (let offset = 0; offset < first.length; offset += FRAME_BYTES) {
    firstLeft += Math.abs(first.readFloatLE(offset))
    firstRight += Math.abs(first.readFloatLE(offset + 4))
    reopenedLeft += Math.abs(reopened.readFloatLE(offset))
    reopenedRight += Math.abs(reopened.readFloatLE(offset + 4))
  }
  expect(firstRight).toBeGreaterThan(firstLeft)
  expect(reopenedLeft).toBeGreaterThan(reopenedRight)
})

test('flush releases old tones without cutting a newly played tone', () => {
  const step = mixerStep(Infinity)
  const first = step(openMixer(0), {
    type: 'play',
    sender: 0,
    tone: tone({ at: -1 }),
    at: 0
  })
  const flushed = step(first, { type: 'flush', sender: 0 })
  const added = step(flushed, {
    type: 'play',
    sender: 0,
    tone: { ...tone({ at: 1 }), toneMs: 400 },
    at: 1
  })
  const rendered = step(added, { type: 'tick', at: 10 })
  const block = rendered.block
  if (block === undefined) throw new Error('expected a rendered block')
  expect(rendered.ringing).toHaveLength(1)
  // The new tone is panned hard right, so the left channel carries only the
  // cos(π/2) residue of its gain once the old tone's release is over.
  for (let frame = 300; frame * FRAME_BYTES < block.length; frame += 1)
    expect(block.readFloatLE(frame * FRAME_BYTES)).toBeCloseTo(0, 9)
  let rightAudible = 0
  for (let frame = 0; frame * FRAME_BYTES < block.length; frame += 1)
    rightAudible += Math.abs(block.readFloatLE(frame * FRAME_BYTES + 4))
  expect(rightAudible).toBeGreaterThan(0)
})

test('end drains a natural source instead of cutting it', () => {
  const step = mixerStep(Infinity)
  const started = step(openMixer(0), {
    type: 'play',
    sender: 0,
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
  const struck = step(opened, {
    type: 'play',
    sender: 0,
    tone: tone({ at: 0 }),
    at: 5
  })
  const block = step(struck, { type: 'tick', at: 10 }).block
  if (block === undefined) throw new Error('expected a rendered block')

  const energy = (from: number, to: number): number => {
    let total = 0
    for (let frame = from; frame < to; frame += 1)
      total += Math.abs(block.readFloatLE(frame * FRAME_BYTES))
    return total
  }
  // 5 ms is 220 frames at 44.1 kHz; the strike lands on the far side of them.
  expect(energy(0, 200)).toBe(0)
  expect(energy(240, 440)).toBeGreaterThan(0)
})

test('two tones inside one tick keep the distance between them', () => {
  const step = mixerStep(Infinity)
  const opened = step(openMixer(0), { type: 'tick', at: 0 })
  const first = step(opened, {
    type: 'play',
    sender: 0,
    tone: tone({ at: 0 }),
    at: 2
  })
  const second = step(first, {
    type: 'play',
    sender: 0,
    tone: tone({ at: 0 }),
    at: 7
  })

  expect(second.ringing.map(({ offset }) => offset)).toEqual([-88, -309])
})

test('a sync that finds the device behind writes nothing until it catches up', () => {
  const step = mixerStep(Infinity)
  // 300 ms and the 120 ms lead are written before the device plays frame 0.
  const written = step(openMixer(0), { type: 'tick', at: 300 })
  const synced = step(written, { type: 'sync', at: 300, heardMs: 0 })
  const struck = step(synced, {
    type: 'play',
    sender: 0,
    tone: tone({ at: 0 }),
    at: 400
  })

  expect(step(struck, { type: 'tick', at: 310 }).block).toBeUndefined()
  expect(struck.ringing.map(({ offset }) => offset)).toEqual([0])
  // Heard frame plus lead passes the 420 ms already written at 600 ms.
  expect(step(struck, { type: 'tick', at: 590 }).block).toBeUndefined()
  expect(step(struck, { type: 'tick', at: 610 }).block).toBeDefined()
})

test('a flush releases only the tones of the sender that sent it', () => {
  const step = mixerStep(Infinity)
  const both = [0, 1].reduce(
    (state, sender) =>
      step(state, { type: 'play', sender, tone: tone({ at: 0 }), at: 0 }),
    openMixer(0)
  )
  const flushed = step(both, { type: 'flush', sender: 1 })

  expect(
    flushed.ringing
      .filter(({ release }) => release > 0)
      .map(({ sender }) => sender)
  ).toEqual([1])
})

test('overlapping loud tones bend under full scale instead of clipping flat', () => {
  const step = mixerStep(Infinity)
  // Eight tones at full volume sum far past 1 at their peak.
  const loud = Array.from({ length: 8 }, (_, sender) => sender).reduce(
    (state, sender) =>
      step(state, {
        type: 'play',
        sender,
        tone: { ...tone({ at: 0 }), volume: 1 },
        at: 0
      }),
    openMixer(0)
  )
  const block = step(loud, { type: 'tick', at: 0 }).block
  if (block === undefined) throw new Error('expected a rendered block')

  const levels = Array.from({ length: block.length / 4 }, (_, index) =>
    Math.abs(block.readFloatLE(index * 4))
  )
  expect(Math.max(...levels)).toBeLessThan(1)
  expect(Math.max(...levels)).toBeGreaterThan(0.8)
})
