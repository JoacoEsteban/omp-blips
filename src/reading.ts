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
 * How a voice reads a character: which ones are voiced, which ones are silent,
 * and what index a voiced one carries. The index means nothing on its own —
 * `pitch.ts` decides what it sounds like.
 *
 * The rate does not belong here. A reading answers what a character is; the
 * shared grid and the voice's `stride` answer when it is heard and how much
 * text one blip stands for.
 */
export type ReadingConfig =
  | { readonly kind: 'alphabet' }
  | { readonly kind: 'codepoint'; readonly span: number }
  | { readonly kind: 'class' }
  | { readonly kind: 'vowels' }
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
 * One blip per word, pitched by a floor that the text moves. The floor advances
 * by the length of the word that just ended, and returns to zero after a
 * terminal mark: the melody is the shape of the sentence, and the silences are
 * the lengths of the words.
 *
 * A fixed increment would be a counter, and a counter is a cycle — the same
 * figure under every sentence. Word lengths vary, so a short word steps and a
 * long one leaps, and the line can only be predicted by reading ahead.
 *
 * This is the reading that paces itself. Sampling the characters inside a word
 * would put the blip at an arbitrary letter, and the sentence would stop being
 * audible.
 */
class Phrase implements Reading {
  constructor(
    private readonly span: number,
    private readonly floor: number,
    /** Characters of the word in progress; zero between words. */
    private readonly length: number
  ) {}

  read(char: string): readonly [Reading, number | undefined] {
    return match(char)
      .when(
        (c) => TERMINALS.includes(c),
        () => [new Phrase(this.span, 0, 0), undefined] as const
      )
      .when(
        (c) => WHITESPACE.test(c),
        () => [this.parted(), undefined] as const
      )
      .when(
        () => this.length > 0,
        () =>
          [
            new Phrase(this.span, this.floor, this.length + 1),
            undefined
          ] as const
      )
      .otherwise(
        () => [new Phrase(this.span, this.floor, 1), this.floor] as const
      )
  }

  /**
   * A word boundary moves the floor by the length of that word. A run of spaces
   * is still one boundary, and the space after a terminal mark keeps the reset
   * floor, so a sentence always opens on its lowest note.
   */
  private parted(): Phrase {
    return match(this.length)
      .with(0, () => new Phrase(this.span, this.floor, 0))
      .otherwise(
        () => new Phrase(this.span, (this.floor + this.length) % this.span, 0)
      )
  }
}

/** The cursor a voice starts from, and returns to whenever its reading changes. */
export const readingOf = (config: ReadingConfig): Reading =>
  match(config)
    .with({ kind: 'alphabet' }, () => new Alphabet())
    .with({ kind: 'codepoint' }, ({ span }) => new Codepoint(span))
    .with({ kind: 'class' }, () => new CharacterClass())
    .with({ kind: 'vowels' }, () => new Vowels())
    .with({ kind: 'phrase' }, ({ span }) => new Phrase(span, 0, 0))
    .exhaustive()
