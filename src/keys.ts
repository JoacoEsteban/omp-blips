import { match, P } from 'ts-pattern'

/**
 * A keystroke the tuner understands. Anything else arrives as the character it
 * typed, so a component matches on letters without decoding escapes itself.
 */
export type Key =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'escape'
  | 'tab'
  | { readonly char: string }

const ESCAPE = '\u001b'
const DELETE = '\u007f'
/** The lowest codepoint that stands for a character rather than a control. */
const FIRST_PRINTABLE = 0x20

/** Cursor keys, in both the normal and the application form, with modifiers. */
const ARROW = /^(?:\[|O)(?:\d+(?:;[\d:]+)*)?([ABCD])$/

/** The Kitty keyboard protocol: `CSI codepoint [;modifiers] u`. */
const KITTY = /^\[(\d+)(?:[;:][\d:;]*)?u$/

const arrowOf = (letter: string): Key =>
  match(letter)
    .with('A', (): Key => 'up')
    .with('B', (): Key => 'down')
    .with('C', (): Key => 'right')
    .otherwise((): Key => 'left')

/**
 * Kitty reports every key as a codepoint, so the named keys have to be read
 * back out of it. The rest is the character the key stands for.
 */
const codepointOf = (code: string): Key | undefined =>
  match(Number.parseInt(code, 10))
    .with(13, 10, (): Key => 'enter')
    .with(27, (): Key => 'escape')
    .with(9, (): Key => 'tab')
    .when(Number.isNaN, () => undefined)
    .otherwise((point): Key => ({ char: String.fromCodePoint(point) }))

/** One typed character, once every escape sequence is accounted for. */
const printableOf = (data: string): Key | undefined =>
  match([...data])
    .with([P.select(P.string)], (char) =>
      match((char.codePointAt(0) ?? 0) >= FIRST_PRINTABLE)
        .with(true, (): Key | undefined => ({ char }))
        .with(false, () => undefined)
        .exhaustive()
    )
    .otherwise(() => undefined)

/** Everything after the escape byte, which no regular expression may carry. */
const sequenceOf = (rest: string): Key | undefined =>
  match(ARROW.exec(rest))
    .with([P._, P.select(P.string)], arrowOf)
    .otherwise(() =>
      match(KITTY.exec(rest))
        .with([P._, P.select(P.string)], codepointOf)
        .otherwise(() => undefined)
    )

/** `undefined` for input the tuner has no use for, such as a paste or a mouse report. */
export const keyOf = (data: string): Key | undefined =>
  match(data)
    .with('\r', '\n', (): Key => 'enter')
    .with('\t', (): Key => 'tab')
    .with(ESCAPE, (): Key => 'escape')
    .with(DELETE, '\b', () => undefined)
    .when(
      (input) => input.startsWith(ESCAPE),
      (input) => sequenceOf(input.slice(ESCAPE.length))
    )
    .otherwise(printableOf)
