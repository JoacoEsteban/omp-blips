import { match } from 'ts-pattern'
import type { StreamKind } from './config.ts'

const CALL_ATTEMPTS = 8

export interface Sample {
  readonly text: string
  readonly problem: string
}

export interface Samples {
  readonly of: (kind: StreamKind, previous: Sample) => Sample
}

export const EMPTY_SAMPLE: Sample = { text: '', problem: '' }

/**
 * The generators cost more to import than the rest of the extension together,
 * and only the tuner ever reads them, so a session that never opens it never
 * pays for them.
 */
export const loadSamples = async (): Promise<Samples> => {
  const [{ loremIpsum }, { generate, render }] = await Promise.all([
    import('lorem-ipsum'),
    import('esfuzz')
  ])

  const prose = (): Sample => ({
    text: loremIpsum({ count: 3, units: 'paragraphs' }),
    problem: ''
  })

  /**
   * Reasoning reads as prose with shorter sentences, so a structural reading
   * hits its sentence reset far more often here than in the answer text.
   */
  const reasoning = (): Sample => ({
    text: loremIpsum({
      count: 14,
      units: 'sentences',
      sentenceLowerBound: 3,
      sentenceUpperBound: 9
    }).toLowerCase(),
    problem: ''
  })

  /** Raw JavaScript, not a tool-call payload; it is read, never run. */
  const call = (previous: Sample): Sample => {
    for (let attempt = 0; attempt < CALL_ATTEMPTS; attempt += 1) {
      const text = render(generate({ maxDepth: 8 }))
      if (text.trim().length > 0) return { text, problem: '' }
    }
    return {
      text: previous.text,
      problem: `no JavaScript sample after ${String(CALL_ATTEMPTS)} attempts`
    }
  }

  return {
    of: (kind, previous) =>
      match(kind)
        .with('text', prose)
        .with('thinking', reasoning)
        .with('tool', () => call(previous))
        .exhaustive()
  }
}
