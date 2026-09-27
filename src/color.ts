import { match, P } from 'ts-pattern'

export type ColorConfig =
  | { readonly kind: 'fixed'; readonly at: number }
  | { readonly kind: 'vowel'; readonly span: number }

export const colorOf = (index: number, config: ColorConfig): number =>
  match(config)
    .with({ kind: 'fixed' }, ({ at }) => Math.min(1, Math.max(0, at)))
    .with({ kind: 'vowel', span: P.number.lte(1) }, () => 0.5)
    .with({ kind: 'vowel' }, ({ span }) => (index % span) / (span - 1))
    .exhaustive()
