import { expect, test } from 'bun:test'
import { keyOf, type Key } from './keys.ts'

const READINGS: readonly (readonly [string, Key | undefined])[] = [
  ['\u001b[A', 'up'],
  ['\u001b[B', 'down'],
  ['\u001bOC', 'right'],
  // Cursor keys keep their letter once a modifier joins them.
  ['\u001b[1;2D', 'left'],
  ['\r', 'enter'],
  ['\n', 'enter'],
  ['\t', 'tab'],
  ['\u001b', 'escape'],
  // The same keys as the Kitty protocol reports them.
  ['\u001b[13u', 'enter'],
  ['\u001b[27u', 'escape'],
  ['\u001b[9u', 'tab'],
  ['\u001b[114u', { char: 'r' }],
  ['r', { char: 'r' }],
  [' ', { char: ' ' }],
  [']', { char: ']' }],
  ['é', { char: 'é' }],
  ['\u007f', undefined],
  // A mouse report and a paste are neither a key nor a character.
  ['\u001b[<0;1;1M', undefined],
  ['hello', undefined],
  ['', undefined]
]

for (const [data, key] of READINGS)
  test(`${JSON.stringify(data)} reads as ${JSON.stringify(key)}`, () => {
    expect(keyOf(data)).toEqual(key)
  })
