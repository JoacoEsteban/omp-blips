import { expect, test } from 'bun:test'
import { firstValueFrom, of, Subject, take, toArray } from 'rxjs'
import { defaultConfig } from './config.ts'
import {
  blipsFrom,
  type Chunk,
  gridFrom,
  gridPeriodMs,
  type Tick,
  tonesFrom
} from './stream.ts'
import type { SpatialConfig } from './spatial.ts'

/** A tick of a 50 ms grid, which is what a 20 Hz preset asks for. */
const tick = (index: number): Tick => ({ index, at: index * 50 })

test('message boundaries preserve the grid phase and discard unread text', () => {
  const chunks = new Subject<Chunk>()
  const restart = new Subject<void>()
  const ticks = new Subject<Tick>()
  const sounded: { at: number; char: string }[] = []
  const subscription = blipsFrom(
    chunks,
    () => of({ voice: { ...defaultConfig.voices.thinking, stride: 1 } }),
    restart,
    ticks
  ).subscribe(({ char, at }) => sounded.push({ at, char }))

  chunks.next({ kind: 'thinking', delta: 'ab' })
  ticks.next(tick(0))
  ticks.next(tick(1))
  restart.next()
  chunks.next({ kind: 'thinking', delta: 'cd' })
  for (let index = 2; index <= 7; index += 1) ticks.next(tick(index))

  expect(sounded).toEqual([
    { at: 0, char: 'a' },
    { at: 150, char: 'c' },
    { at: 300, char: 'd' }
  ])
  subscription.unsubscribe()
})

test('the grid keeps its own time whatever the timer does', async () => {
  const ticks = await firstValueFrom(
    gridFrom(of(200)).pipe(take(12), toArray())
  )
  const period = gridPeriodMs(200)
  const gaps = ticks
    .slice(1)
    .map(({ at }, index) => at - (ticks[index]?.at ?? 0))

  expect(period).toBe(5)
  expect(ticks.map(({ index }) => index)).toEqual([...Array(12).keys()])
  for (const gap of gaps) expect(gap).toBeCloseTo(period, 9)
})

test('a burst drains in eight sounding ticks and restores the configured stride', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<Tick>()
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
  for (let index = 0; index < 16; index += 1) ticks.next(tick(index))
  expect(sounded).toEqual([...Array<string>(7).fill('a'), 'z'])

  deltas.next('bc')
  ticks.next(tick(16))
  ticks.next(tick(17))
  ticks.next(tick(18))
  expect(sounded.slice(8)).toEqual(['b', 'c'])
  subscription.unsubscribe()
})

test('new text can widen an ongoing catch-up without extending it indefinitely', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<Tick>()
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
  ticks.next(tick(0))
  deltas.next('b'.repeat(999) + 'z')
  for (let index = 1; index <= 8; index += 1) ticks.next(tick(index))
  expect(sounded.at(-1)).toBe('z')
  subscription.unsubscribe()
})

test('spatial characters route from the selected character, not its index', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<Tick>()
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
  ticks.next(tick(0))
  expect(sounded).toEqual([0.8])
  subscription.unsubscribe()
})

test('alternate spatial placement advances only for emitted blips', () => {
  const deltas = new Subject<string>()
  const ticks = new Subject<Tick>()
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
  ticks.next(tick(0))
  ticks.next(tick(1))
  ticks.next(tick(2))
  expect(sounded).toEqual([-1, 1])
  subscription.unsubscribe()
})

test('alternate placement resets at a message boundary', () => {
  const chunks = new Subject<Chunk>()
  const restart = new Subject<void>()
  const ticks = new Subject<Tick>()
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
  ticks.next(tick(0))
  restart.next()
  chunks.next({ kind: 'text', delta: 'b' })
  ticks.next(tick(1))
  expect(sounded).toEqual([-1, -1])
  subscription.unsubscribe()
})
