import { match } from 'ts-pattern'
import type { StreamKind } from './config.ts'

export interface Sample {
  readonly text: string
}

export interface Samples {
  readonly of: (kind: StreamKind) => Sample
}

export const EMPTY_SAMPLE: Sample = { text: '' }

export const loadSamples = async (): Promise<Samples> => {
  const [{ loremIpsum }, { javascript }] = await Promise.all([
    import('lorem-ipsum'),
    import('./javascript.ts')
  ])

  const prose = (): Sample => ({
    text: loremIpsum({ count: 3, units: 'paragraphs' })
  })

  const reasoning = (): Sample => ({
    text: loremIpsum({
      count: 14,
      units: 'sentences',
      sentenceLowerBound: 3,
      sentenceUpperBound: 9
    }).toLowerCase()
  })

  const call = (): Sample => ({
    text: javascript(Math.random)
  })

  return {
    of: (kind) =>
      match(kind)
        .with('text', prose)
        .with('thinking', reasoning)
        .with('tool', call)
        .exhaustive()
  }
}
