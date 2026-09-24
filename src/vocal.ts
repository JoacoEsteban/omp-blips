import { match } from 'ts-pattern'
import {
  CEILING,
  RELEASE_FRAMES,
  SAMPLE_RATE,
  VOICE_GAIN,
  type Sound,
  type Touch
} from './synth.ts'

/**
 * Everything the renderer needs that is particular to one fitted voice. A
 * profile is data: `vocal-profile.ts` holds the Sans fit, and another voice
 * is another value of this shape, not another renderer.
 */
export interface VocalProfile {
  /** The base frequency the whole profile was measured at. */
  readonly frequency: number
  /** The profile's own tone length; the chirp and cycle curves are fractions of it. */
  readonly durationS: number
  /** The fundamental's rise across the tone, as a line in real time. */
  readonly chirp: {
    readonly startHz: number
    readonly slopeHzPerSecond: number
  }
  /** Each lower harmonic's level over the tone, relative to the fundamental. */
  readonly harmonicEnvelope: {
    readonly fractions: readonly number[]
    readonly gains: readonly (readonly number[])[]
  }
  /** Harmonics above this take their weight from `upper.bands` instead. */
  readonly cutoffHz: number
  /** Relative phase by harmonic number, 1-based; index 0 unused. */
  readonly phases: readonly number[]
  readonly upper: {
    readonly bands: readonly {
      readonly harmonics: readonly number[]
      readonly weights: readonly number[]
    }[]
    /** Per-band trim by band index; a missing entry leaves the weight alone. */
    readonly trims: readonly number[]
    readonly gain: number
    /** The upper band's own fade in, on top of the tone's envelope. */
    readonly attackMs: number
  }
  /** Flat trim on every harmonic under the cutoff. */
  readonly lowerTrim: number
  /** Base modal decay rate, before the voice's own `decay` multiplier. */
  readonly modalDecay: number
  /** Per-harmonic detune depth, so the harmonics do not stay perfectly locked. */
  readonly roughness: number
  /** Fine loudness shape over the tone, on top of `swell` and `hold`. */
  readonly bodyEnvelope: readonly number[]
  /** Cycle-to-cycle pitch wobble, as a fraction of the instantaneous fundamental. */
  readonly cycle: {
    readonly fractions: readonly number[]
    readonly variation: readonly number[]
  }
}

const TOUCH_ATTACK_MS: Readonly<Record<Touch, number>> = {
  soft: 14,
  normal: 8,
  firm: 5
}

/** Value at `fraction` (0..1) over evenly spaced knots, clamped at the ends. */
const interpolateEven = (
  knots: readonly number[],
  fraction: number
): number => {
  const first = knots[0]
  if (first === undefined) return 0
  const clamped = Math.min(1, Math.max(0, fraction))
  const position = clamped * (knots.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.min(knots.length - 1, lowerIndex + 1)
  const lower = knots[lowerIndex] ?? first
  const upper = knots[upperIndex] ?? lower
  return lower + (upper - lower) * (position - lowerIndex)
}

/** Value at `fraction` over `values` at matching `fractions`, clamped at the ends. */
const interpolateAt = (
  fractions: readonly number[],
  values: readonly number[],
  fraction: number
): number => {
  const firstValue = values[0]
  if (firstValue === undefined) return 0
  const lastIndex = fractions.length - 1
  const firstFraction = fractions[0] ?? 0
  const lastFraction = fractions[lastIndex] ?? firstFraction
  const lastValue = values[lastIndex] ?? firstValue
  if (fraction <= firstFraction) return firstValue
  if (fraction >= lastFraction) return lastValue
  let upperIndex = 1
  while ((fractions[upperIndex] ?? lastFraction) < fraction) upperIndex += 1
  const lowerIndex = upperIndex - 1
  const lowerFraction = fractions[lowerIndex] ?? firstFraction
  const upperFraction = fractions[upperIndex] ?? lastFraction
  const lowerValue = values[lowerIndex] ?? firstValue
  const upperValue = values[upperIndex] ?? lastValue
  const span = upperFraction - lowerFraction
  const t = match(span)
    .with(0, () => 0)
    .otherwise(() => (fraction - lowerFraction) / span)
  return lowerValue + (upperValue - lowerValue) * t
}

interface VocalPartial {
  readonly ratio: number
  readonly gain: number
  /** Measured gain at each `harmonicEnvelope.fractions` knot; lower partials only. */
  readonly envelopeGains: readonly number[]
  readonly isUpper: boolean
  phase: number
  decay: number
}

/** The fixed harmonic weights, independent of the tone length. */
const partialsFor = (
  sound: Sound,
  profile: VocalProfile
): readonly VocalPartial[] => {
  const nyquist = SAMPLE_RATE / 2
  const partials: VocalPartial[] = []
  const cutoffHarmonic = Math.floor(profile.cutoffHz / profile.frequency)
  for (let n = 1; n <= cutoffHarmonic; n += 1) {
    if (n * sound.frequency >= nyquist) break
    partials.push({
      ratio: n,
      gain: profile.lowerTrim,
      envelopeGains: profile.harmonicEnvelope.gains[n - 1] ?? [],
      isUpper: false,
      phase: 0,
      decay: 1
    })
  }
  for (const [bandIndex, band] of profile.upper.bands.entries()) {
    const bandTrim = profile.upper.trims[bandIndex] ?? 1
    for (const [index, n] of band.harmonics.entries()) {
      if (n * sound.frequency >= nyquist) break
      partials.push({
        ratio: n,
        gain: profile.upper.gain * bandTrim * (band.weights[index] ?? 0),
        envelopeGains: [],
        isUpper: true,
        phase: 0,
        decay: 1
      })
    }
  }
  return partials
}

/**
 * The dedicated procedural renderer for a vocal material. Unlike the generic
 * modal path, its harmonic source is a chirp taken from `profile`: the
 * fundamental rises across the tone, each harmonic keeps its own measured
 * phase and (below the profile's cutoff) its own measured envelope, read off
 * a recording's spectral shape over time rather than approximated from a
 * handful of formants; a brighter set of upper harmonics keeps its own fixed
 * weights. The profile's body envelope and small cycle-to-cycle pitch wobble
 * sit on top of the ordinary `swell`/`hold`/`decay` controls.
 */
export const renderVocal = (
  sound: Sound,
  profile: VocalProfile
): Float32Array => {
  const frames = Math.max(1, Math.round((SAMPLE_RATE * sound.toneMs) / 1000))
  const samples = new Float32Array(frames)
  if (frames <= 2) return samples

  const last = frames - 1
  const releaseFrames = Math.max(
    1,
    Math.min(RELEASE_FRAMES, Math.floor(last / 2))
  )
  const releaseStart = last - releaseFrames
  const holdFrames = Math.round(Math.min(1, Math.max(0, sound.hold)) * last)
  const attackFrames = Math.max(
    1,
    Math.round((SAMPLE_RATE * TOUCH_ATTACK_MS[sound.touch]) / 1000)
  )
  const upperAttackFrames = Math.max(
    1,
    Math.round((SAMPLE_RATE * profile.upper.attackMs) / 1000)
  )
  const riseFrames = Math.max(
    attackFrames,
    Math.round(Math.min(1, Math.max(0, sound.swell)) * last)
  )
  const glideFrom = 2 ** (sound.glide / 12)
  const glideStep = (1 / glideFrom) ** (1 / last)
  let glideBend = glideFrom

  const partials = partialsFor(sound, profile)
  let peak = 0

  for (let i = 1; i < last; i += 1) {
    const fraction = i / last
    const attack = Math.min(1, i / riseFrames)
    const releaseProgress = Math.max(0, (i - releaseStart) / releaseFrames)
    const release = 0.5 * (1 + Math.cos(Math.PI * releaseProgress))
    const upperOnset = Math.min(1, i / upperAttackFrames)
    const bodyEnvelope = interpolateEven(profile.bodyEnvelope, fraction)
    const contourSeconds = fraction * profile.durationS
    const jitter = interpolateAt(
      profile.cycle.fractions,
      profile.cycle.variation,
      fraction
    )
    const chirpHz =
      profile.chirp.startHz + profile.chirp.slopeHzPerSecond * contourSeconds
    const chirpBend = (chirpHz / profile.frequency) * (1 + jitter)

    let resonances = 0
    for (const partial of partials) {
      const roughness =
        1 + profile.roughness * Math.sin(partial.ratio * 12.9898 + 78.233)
      const phaseStep =
        (2 *
          Math.PI *
          partial.ratio *
          sound.frequency *
          chirpBend *
          roughness *
          glideBend) /
        SAMPLE_RATE
      const phaseFit = profile.phases[partial.ratio] ?? 0
      const totalPhase = partial.phase + phaseFit
      const envelopeGain = match(partial.isUpper)
        .with(true, () => 1)
        .otherwise(() =>
          interpolateAt(
            profile.harmonicEnvelope.fractions,
            partial.envelopeGains,
            fraction
          )
        )
      const onset = match(partial.isUpper)
        .with(true, () => upperOnset)
        .otherwise(() => 1)
      resonances +=
        Math.sin(totalPhase) *
        partial.gain *
        envelopeGain *
        partial.decay *
        onset
      partial.phase += phaseStep
      if (i > holdFrames) {
        // The measured envelope already carries each lower harmonic's real
        // decay shape; only the explicit upper-band harmonics (uncovered by
        // that measurement) still need a synthetic per-harmonic decay rate.
        const decayRate = match(partial.isUpper)
          .with(true, () => profile.modalDecay * (0.5 + partial.ratio * 0.08))
          .otherwise(() => profile.modalDecay * 0.5)
        partial.decay *= Math.exp(
          -(decayRate * sound.decay) / Math.max(1, frames - 1)
        )
      }
    }
    glideBend *= glideStep

    const sample = resonances * VOICE_GAIN * attack * release * bodyEnvelope
    samples[i] = sample
    peak = Math.max(peak, Math.abs(sample))
  }

  if (peak <= CEILING) return samples
  const limit = CEILING / peak
  for (const [index, value] of samples.entries()) samples[index] = value * limit
  return samples
}
