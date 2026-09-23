import { match, P } from 'ts-pattern'

const CODE_LOWER_A = 97
const CODE_LOWER_Z = 122
const CODE_0 = 48
const CODE_9 = 57
/** Everything at or below a space is whitespace or a control character. */
const CODE_SPACE = 32

const LETTER_COUNT = CODE_LOWER_Z - CODE_LOWER_A + 1
const VOWELS = 'aeiou'
/** The marks that end a sentence, for readings that follow phrasing. */
const TERMINALS = '.!?'
const WHITESPACE = /\s/u

/**
 * How a voice consumes characters: which ones are voiced, which ones are
 * silent, how many it spends on one blip, and what index a voiced one carries.
 * The index means nothing on its own — `pitch.ts` decides what it sounds like.
 *
 * The rate belongs here and not to the voice. A reading that samples every `n`
 * sounded characters says so; `phrase` has no such field, because it already
 * paces itself by the words of the text. A counter outside the reading would
 * land on an arbitrary character of each word and lose the shape the reading
 * built.
 */
export type ReadingConfig =
  | { readonly kind: 'alphabet'; readonly every: number }
  | {
      readonly kind: 'codepoint'
      readonly span: number
      readonly every: number
    }
  | { readonly kind: 'class'; readonly every: number }
  | { readonly kind: 'vowels'; readonly every: number }
  | { readonly kind: 'phrase'; readonly span: number }

/**
 * A cursor over the stream: it reads one character and returns the reading that
 * continues after it. State lives inside the cursor, so a reading with memory
 * needs no type parameter and the fold carries a single value.
 */
export interface Reading {
  readonly read: (char: string) => readonly [Reading, number | undefined]
}

/** A reading with no memory: the cursor after a character is the cursor before it. */
abstract class Memoryless implements Reading {
  protected abstract indexOf(char: string): number | undefined

  read(char: string): readonly [Reading, number | undefined] {
    return [this, this.indexOf(char)]
  }
}

/**
 * Letters ascend alphabetically, digits continue above them, everything else
 * (whitespace, punctuation) is silent so the rhythm follows words instead of
 * hammering a constant tone.
 */
class Alphabet extends Memoryless {
  protected override indexOf(char: string): number | undefined {
    return match(char.toLowerCase().codePointAt(0))
      .with(
        P.number.between(CODE_LOWER_A, CODE_LOWER_Z),
        (code) => code - CODE_LOWER_A
      )
      .with(
        P.number.between(CODE_0, CODE_9),
        (code) => LETTER_COUNT + (code - CODE_0)
      )
      .otherwise(() => undefined)
  }
}

/**
 * Every visible character, folded into `span` indices. Punctuation and brackets
 * play too, so dense JSON reads as a texture rather than as gaps.
 */
class Codepoint extends Memoryless {
  constructor(private readonly span: number) {
    super()
  }

  protected override indexOf(char: string): number | undefined {
    return match(char.codePointAt(0))
      .with(P.number.gt(CODE_SPACE), (code) => code % this.span)
      .otherwise(() => undefined)
  }
}

/**
 * Four indices: vowel, consonant, digit, punctuation. The alphabet disappears
 * and what is left is the shape of the text, which the ear reads as rhythm.
 */
class CharacterClass extends Memoryless {
  protected override indexOf(char: string): number | undefined {
    const lower = char.toLowerCase()
    return match(lower)
      .when(
        (c) => VOWELS.includes(c),
        () => 0
      )
      .when(
        (c) => c >= 'a' && c <= 'z',
        () => 1
      )
      .when(
        (c) => c >= '0' && c <= '9',
        () => 2
      )
      .when(
        (c) => WHITESPACE.test(c),
        () => undefined
      )
      .otherwise(() => 3)
  }
}

/** Vowels only, by their position in `aeiou`. Prose thins out to its spine. */
class Vowels extends Memoryless {
  protected override indexOf(char: string): number | undefined {
    return match(VOWELS.indexOf(char.toLowerCase()))
      .with(P.number.gte(0), (index) => index)
      .otherwise(() => undefined)
  }
}

/**
 * One blip per word, pitched by the floor. The floor climbs at each word
 * boundary and returns to zero after a terminal mark, so the melody is the
 * shape of the sentence and the silences are the lengths of the words.
 *
 * This is the reading that paces itself. Sampling the characters inside a word
 * would put the blip at an arbitrary letter, and the sentence would stop being
 * audible.
 */
class Phrase implements Reading {
  constructor(
    private readonly span: number,
    private readonly floor: number,
    private readonly inWord: boolean
  ) {}

  read(char: string): readonly [Reading, number | undefined] {
    return match(char)
      .when(
        (c) => TERMINALS.includes(c),
        () => [new Phrase(this.span, 0, false), undefined] as const
      )
      .when(
        (c) => WHITESPACE.test(c),
        () => [this.parted(), undefined] as const
      )
      .when(
        () => this.inWord,
        () => [this, undefined] as const
      )
      .otherwise(
        () => [new Phrase(this.span, this.floor, true), this.floor] as const
      )
  }

  /**
   * A word boundary lifts the floor once. A run of spaces is still one
   * boundary, and the space after a terminal mark keeps the reset floor, so a
   * sentence always opens on its lowest note.
   */
  private parted(): Phrase {
    return match(this.inWord)
      .with(false, () => new Phrase(this.span, this.floor, false))
      .with(
        true,
        () => new Phrase(this.span, (this.floor + 1) % this.span, false)
      )
      .exhaustive()
  }
}

/**
 * Spends `every` sounded characters on one blip. Silent characters cost
 * nothing, so the rate stays the same in prose and in dense tool arguments.
 */
class Sampled implements Reading {
  constructor(
    private readonly every: number,
    private readonly inner: Reading,
    private readonly spent: number
  ) {}

  read(char: string): readonly [Reading, number | undefined] {
    const [inner, index] = this.inner.read(char)
    return match(index)
      .with(P.nullish, () => [this.carrying(inner), undefined] as const)
      .otherwise((sounded) =>
        match(this.spent + 1 >= this.every)
          .with(
            false,
            () =>
              [
                new Sampled(this.every, inner, this.spent + 1),
                undefined
              ] as const
          )
          .with(
            true,
            () => [new Sampled(this.every, inner, 0), sounded] as const
          )
          .exhaustive()
      )
  }

  private carrying(inner: Reading): Sampled {
    return new Sampled(this.every, inner, this.spent)
  }
}

/** The cursor a voice starts from, and returns to whenever its reading changes. */
export const readingOf = (config: ReadingConfig): Reading =>
  match(config)
    .with(
      { kind: 'alphabet' },
      ({ every }) => new Sampled(every, new Alphabet(), 0)
    )
    .with(
      { kind: 'codepoint' },
      ({ span, every }) => new Sampled(every, new Codepoint(span), 0)
    )
    .with(
      { kind: 'class' },
      ({ every }) => new Sampled(every, new CharacterClass(), 0)
    )
    .with(
      { kind: 'vowels' },
      ({ every }) => new Sampled(every, new Vowels(), 0)
    )
    .with({ kind: 'phrase' }, ({ span }) => new Phrase(span, 0, false))
    .exhaustive()
