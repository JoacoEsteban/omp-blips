import { expect, test } from 'bun:test'
import { of, Subject } from 'rxjs'
import { TestScheduler } from 'rxjs/testing'
import { defaultConfig } from './config.ts'
import { blipsFrom, type Chunk, gridFrom, tonesFrom } from './stream.ts'
import type { SpatialConfig } from './spatial.ts'

test('message boundaries preserve the grid phase and discard unread text', () => {
  const scheduler = new TestScheduler(() => {})
  scheduler.run(() => {
    const chunks = new Subject<Chunk>()
    const restart = new Subject<void>()
    const sounded: { at: number; char: string }[] = []
    const subscription = blipsFrom(
      chunks,
      () => of({ voice: { ...defaultConfig.voices.thinking, stride: 1 } }),
      restart,
      gridFrom(of(20))
    ).subscribe(({ char }) => sounded.push({ at: scheduler.now(), char }))

    scheduler.schedule(() => chunks.next({ kind: 'thinking', delta: 'ab' }), 10)
    scheduler.schedule(() => restart.next(), 70)
    scheduler.schedule(() => chunks.next({ kind: 'thinking', delta: 'cd' }), 80)
    scheduler.schedule(() => subscription.unsubscribe(), 360)
    scheduler.flush()

    expect(sounded).toEqual([
      { at: 50, char: 'a' },
      { at: 200, char: 'c' },
      { at: 350, char: 'd' }
    ])
  })
})

test('a burst drains in eight sounding ticks and restores the configured stride', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<number>()
  const sounded: string[] = []
  const subscription = deltas
    .pipe(
      tonesFrom(
        of({ voice: { ...defaultConfig.voices.text, stride: 1, divisor: 2 } }),
        ticks
      )
    )
    .subscribe(({ char }) => sounded.push(char))

  deltas.next('a'.repeat(999) + 'z')
  for (let tick = 0; tick < 16; tick += 1) ticks.next(tick)
  expect(sounded).toEqual([...Array<string>(7).fill('a'), 'z'])

  deltas.next('bc')
  ticks.next(16)
  ticks.next(17)
  ticks.next(18)
  expect(sounded.slice(8)).toEqual(['b', 'c'])
  subscription.unsubscribe()
})

test('new text can widen an ongoing catch-up without extending it indefinitely', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<number>()
  const sounded: string[] = []
  const subscription = deltas
    .pipe(
      tonesFrom(
        of({ voice: { ...defaultConfig.voices.text, stride: 1, divisor: 1 } }),
        ticks
      )
    )
    .subscribe(({ char }) => sounded.push(char))

  deltas.next('a'.repeat(1000))
  ticks.next(0)
  deltas.next('b'.repeat(999) + 'z')
  for (let tick = 1; tick <= 8; tick += 1) ticks.next(tick)
  expect(sounded.at(-1)).toBe('z')
  subscription.unsubscribe()
})

test('spatial characters route from the selected character, not its index', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<number>()
  const spatial: SpatialConfig = {
    placement: {
      kind: 'characters',
      groups: [
        { chars: 'a', at: -0.8 },
        { chars: '1', at: 0.8 }
      ],
      otherwise: 0
    }
  }
  const sounded: number[] = []
  const subscription = deltas
    .pipe(
      tonesFrom(
        of({
          voice: {
            ...defaultConfig.voices.text,
            stride: 2,
            divisor: 1,
            spatial
          }
        }),
        ticks
      )
    )
    .subscribe(({ tone }) => sounded.push(tone.spatial.at))

  deltas.next('a1')
  ticks.next(0)
  expect(sounded).toEqual([0.8])
  subscription.unsubscribe()
})

test('alternate spatial placement advances only for emitted blips', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<number>()
  const spatial: SpatialConfig = {
    placement: { kind: 'alternate', positions: [-1, 1] }
  }
  const sounded: number[] = []
  const subscription = deltas
    .pipe(
      tonesFrom(
        of({
          voice: {
            ...defaultConfig.voices.text,
            stride: 1,
            divisor: 1,
            spatial
          }
        }),
        ticks
      )
    )
    .subscribe(({ tone }) => sounded.push(tone.spatial.at))

  deltas.next('a b')
  ticks.next(0)
  ticks.next(1)
  ticks.next(2)
  expect(sounded).toEqual([-1, 1])
  subscription.unsubscribe()
})

test('alternate placement resets at a message boundary', () => {
  const chunks = new Subject<Chunk>()
  const restart = new Subject<void>()
  const ticks = new Subject<number>()
  const spatial: SpatialConfig = {
    placement: { kind: 'alternate', positions: [-1, 1] }
  }
  const sounded: number[] = []
  const subscription = blipsFrom(
    chunks,
    () =>
      of({
        voice: {
          ...defaultConfig.voices.text,
          stride: 1,
          divisor: 1,
          spatial
        }
      }),
    restart,
    ticks
  ).subscribe(({ tone }) => sounded.push(tone.spatial.at))

  chunks.next({ kind: 'text', delta: 'a' })
  ticks.next(0)
  restart.next()
  chunks.next({ kind: 'text', delta: 'b' })
  ticks.next(1)
  expect(sounded).toEqual([-1, -1])
  subscription.unsubscribe()
})
