import { expect, test } from 'bun:test'
import { of, Subject } from 'rxjs'
import { TestScheduler } from 'rxjs/testing'
import { defaultConfig } from './config.ts'
import { blipsFrom, type Chunk, gridFrom, tonesFrom } from './stream.ts'

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
