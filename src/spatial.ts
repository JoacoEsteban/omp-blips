import { match } from 'ts-pattern'

/** A sinusoidal pan movement around a placement. */
export interface SpatialMotion {
  readonly kind: 'oscillate'
  readonly clock: 'tone' | 'voice'
  readonly depth: number
  readonly periodMs: number
}

type SpatialPlacement =
  | { readonly kind: 'fixed'; readonly at: number }
  | {
      readonly kind: 'characters'
      readonly groups: readonly {
        readonly chars: string
        readonly at: number
      }[]
      readonly otherwise: number
    }
  | { readonly kind: 'alternate'; readonly positions: readonly number[] }

/** A pan placement and optional movement applied by the audio backend. */
export interface SpatialConfig {
  readonly placement: SpatialPlacement
  readonly motion?: SpatialMotion | undefined
}

/** Spatial information attached to one scheduled tone. */
export interface ToneSpatial {
  readonly at: number
  readonly motion?: SpatialMotion | undefined
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Membership compares complete graphemes, preserving case and group order. */
const hasGrapheme = (chars: string, selected: string): boolean => {
  for (const { segment } of segmenter.segment(chars))
    if (segment === selected) return true
  return false
}

/** Resolve placement from the selected grapheme and emitted blip ordinal. */
export const spatialOf = (
  selected: string,
  ordinal: number,
  config: SpatialConfig
): ToneSpatial => {
  const at = match(config.placement)
    .with({ kind: 'fixed' }, ({ at: position }) => position)
    .with({ kind: 'alternate' }, ({ positions }) => {
      const position = positions[ordinal % positions.length]
      return position ?? 0
    })
    .with({ kind: 'characters' }, ({ groups, otherwise }) => {
      const group = groups.find(({ chars }) => hasGrapheme(chars, selected))
      return group?.at ?? otherwise
    })
    .exhaustive()
  if (config.motion === undefined) return { at }
  return { at, motion: config.motion }
}
