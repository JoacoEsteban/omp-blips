import { match } from 'ts-pattern'
import {
  CEILING,
  RELEASE_FRAMES,
  resonance,
  SAMPLE_RATE,
  VOICE_GAIN,
  type Formant,
  type Sound,
  type Touch
} from './synth.ts'
import {
  BODY_ENVELOPE,
  CYCLE_FRACTIONS,
  CYCLE_VARIATION,
  F1_GLIDE_FRACTIONS,
  F1_GLIDE_HZ,
  FORMANT_SWEEP,
  FORMANTS,
  HARMONIC_CUTOFF_HZ,
  HARMONIC_PHASES,
  PITCH_CHIRP,
  PROFILE_FREQUENCY,
  SOURCE_TILT,
  TEXTURE_BANDS_HZ,
  TEXTURE_FRACTIONS,
  TEXTURE_GAINS,
  UPPER_ATTACK_MS,
  UPPER_BANDS
} from './vocal-profile.ts'

/** The profile's own tone length; the chirp and cycle curves are fractions of it. */
const PROFILE_DURATION_S = 0.115
/** Slower than the generic modal materials: the approved candidate rings longer. */
const MODAL_DECAY = 0.66
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

/** Which measured texture band a lower harmonic's nominal frequency falls in. */
const textureBandOf = (harmonicHz: number): number => {
  const index = TEXTURE_BANDS_HZ.findIndex(([, high]) => harmonicHz < high)
  return match(index)
    .with(-1, () => TEXTURE_BANDS_HZ.length - 1)
    .otherwise((found) => found)
}

interface VocalPartial {
  readonly ratio: number
  readonly gain: number
  /** Formant-shaped gain at each `F1_GLIDE_FRACTIONS` knot; lower partials only. */
  readonly glideGains: readonly number[]
  readonly textureBand: number
  readonly isUpper: boolean
  phase: number
  decay: number
}

/** The fixed harmonic weights and formant shaping, independent of the tone length. */
const partialsFor = (sound: Sound): readonly VocalPartial[] => {
  const nyquist = SAMPLE_RATE / 2
  const formantsAt = (f1Hz: number): readonly Formant[] =>
    FORMANTS.map((formant, index) =>
      match(index)
        .with(0, () => ({ ...formant, hz: f1Hz }))
        .with(1, () => ({
          ...formant,
          hz: formant.hz + (sound.color - 0.5) * FORMANT_SWEEP
        }))
        .otherwise(() => formant)
    )
  const partials: VocalPartial[] = []
  const cutoffHarmonic = Math.floor(HARMONIC_CUTOFF_HZ / PROFILE_FREQUENCY)
  const lowerTrim = 2.24
  for (let n = 1; n <= cutoffHarmonic; n += 1) {
    if (n * sound.frequency >= nyquist) break
    const glideGains = F1_GLIDE_HZ.map((f1Hz) =>
      formantsAt(f1Hz).reduce(
        (sum, formant) => sum + resonance(n * PROFILE_FREQUENCY, formant),
        0
      )
    )
    partials.push({
      ratio: n,
      gain: lowerTrim / n ** SOURCE_TILT,
      glideGains,
      textureBand: textureBandOf(n * PROFILE_FREQUENCY),
      isUpper: false,
      phase: 0,
      decay: 1
    })
  }
  for (const [bandIndex, band] of UPPER_BANDS.entries()) {
    const bandTrim = match(bandIndex)
      .with(1, () => 0.77)
      .otherwise(() => 1)
    for (const [index, n] of band.harmonics.entries()) {
      if (n * sound.frequency >= nyquist) break
      partials.push({
        ratio: n,
        gain: 0.4 * bandTrim * (band.weights[index] ?? 0),
        glideGains: [],
        textureBand: -1,
        isUpper: true,
        phase: 0,
        decay: 1
      })
    }
  }
  return partials
}

/**
 * The dedicated procedural renderer for the `vocal` material. Unlike the
 * generic modal path, its harmonic source is a chirp fitted to the approved
 * Sans audition: the fundamental rises across the tone, each harmonic keeps
 * its own measured phase and (below `HARMONIC_CUTOFF_HZ`) is shaped by three
 * fixed formants; a brighter set of upper harmonics keeps its own fixed
 * weights. A measured envelope and small cycle-to-cycle pitch wobble sit on
 * top of the ordinary `swell`/`hold`/`decay` controls.
 */
export const renderVocal = (
  sound: Sound & { readonly material: 'vocal' }
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
    Math.round((SAMPLE_RATE * UPPER_ATTACK_MS) / 1000)
  )
  const riseFrames = Math.max(
    attackFrames,
    Math.round(Math.min(1, Math.max(0, sound.swell)) * last)
  )
  const glideFrom = 2 ** (sound.glide / 12)
  const glideStep = (1 / glideFrom) ** (1 / last)
  let glideBend = glideFrom

  const partials = partialsFor(sound)
  let peak = 0

  for (let i = 1; i < last; i += 1) {
    const fraction = i / last
    const attack = Math.min(1, i / riseFrames)
    const releaseProgress = Math.max(0, (i - releaseStart) / releaseFrames)
    const release = 0.5 * (1 + Math.cos(Math.PI * releaseProgress))
    const upperOnset = Math.min(1, i / upperAttackFrames)
    const bodyEnvelope = interpolateEven(BODY_ENVELOPE, fraction)
    const contourSeconds = fraction * PROFILE_DURATION_S
    const jitter = interpolateAt(CYCLE_FRACTIONS, CYCLE_VARIATION, fraction)
    const chirpHz =
      PITCH_CHIRP.startHz + PITCH_CHIRP.slopeHzPerSecond * contourSeconds
    const chirpBend = (chirpHz / PROFILE_FREQUENCY) * (1 + jitter)

    let resonances = 0
    for (const partial of partials) {
      const roughness = 1 + 0.0015 * Math.sin(partial.ratio * 12.9898 + 78.233)
      const phaseStep =
        (2 *
          Math.PI *
          partial.ratio *
          sound.frequency *
          chirpBend *
          roughness *
          glideBend) /
        SAMPLE_RATE
      const phaseFit = HARMONIC_PHASES[partial.ratio] ?? 0
      const totalPhase = partial.phase + phaseFit
      const textureGain = match(partial.isUpper)
        .with(true, () => 1)
        .otherwise(() =>
          interpolateAt(
            TEXTURE_FRACTIONS,
            TEXTURE_GAINS[partial.textureBand] ?? [],
            fraction
          )
        )
      const onset = match(partial.isUpper)
        .with(true, () => upperOnset)
        .otherwise(() => 1)
      const formantGain = match(partial.isUpper)
        .with(true, () => 1)
        .otherwise(() =>
          interpolateAt(F1_GLIDE_FRACTIONS, partial.glideGains, fraction)
        )
      resonances +=
        Math.sin(totalPhase) *
        partial.gain *
        textureGain *
        formantGain *
        partial.decay *
        onset
      partial.phase += phaseStep
      if (i > holdFrames) {
        const decayRate = MODAL_DECAY * (0.5 + partial.ratio * 0.08)
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
