/**
 * Measured controls for the dedicated `vocal` renderer, fitted from the
 * approved Sans audition candidate against `voice_sans.mp3`. Every array here
 * is a compact, resampled summary of that fit, not a copy of the recording:
 * `voice()` still renders every sample at request time in `vocal.ts`.
 */

/** The base frequency the whole profile was measured at. */
export const PROFILE_FREQUENCY = 164.81

/**
 * The fundamental rises across the tone instead of holding steady. Fitted as
 * a line through six windows of the approved candidate; endpoints extrapolate
 * from interior estimates.
 */
export const PITCH_CHIRP = {
  startHz: 158.0679,
  slopeHzPerSecond: 130.3714
}

/**
 * Three fixed resonances shape the harmonic source, the same way `reed` and
 * `brass` do. The first resonance sits on the second harmonic, which is the
 * low, rounded part of the register; the other two stay quiet.
 */
export const FORMANTS: readonly {
  readonly hz: number
  readonly bw: number
  readonly gain: number
}[] = [
  { hz: 450, bw: 160, gain: 1 },
  { hz: 1850, bw: 220, gain: 0.8 },
  { hz: 2800, bw: 200, gain: 0.3 }
]

/**
 * The first formant is not static in the recording: LPC tracking (12th-order,
 * 10 kHz downsample, 30 ms Hamming windows) shows it falling from ~430 Hz to
 * ~280 Hz across the tone as the mouth closes from an open vowel toward the
 * brief close-front tail the recording ends on; the last two knots
 * extrapolate that closing motion through the tail LPC can't resolve
 * cleanly (energy too low, windows too short). `F2`/`F3` were noisier in the
 * same tracking and are left static for now so this stays an isolated change.
 */
export const F1_GLIDE_FRACTIONS: readonly number[] = [
  10 / 140,
  26 / 140,
  42 / 140,
  56 / 140,
  70 / 140,
  86 / 140,
  98 / 140,
  120 / 140,
  1
]
export const F1_GLIDE_HZ: readonly number[] = [
  432, 400, 353, 337, 330, 316, 293, 260, 235
]

/** How far `color` slides the second formant, in Hz. */
export const FORMANT_SWEEP = 460

/** Fall of the harmonic source spectrum below the cutoff, as `1 / n ** tilt`. */
export const SOURCE_TILT = 0.4

/** Harmonics above this settle into the explicit `UPPER_BANDS` weights instead. */
export const HARMONIC_CUTOFF_HZ = 5200

/** Highest harmonic number the profile has a measured weight for. */
export const HARMONIC_LIMIT = 60

/**
 * Relative phase of each harmonic (index = harmonic number, 1-based; index 0
 * unused), with the harmonic-number multiple of the fundamental's own phase
 * already removed. The renderer adds that multiple back at request time, so
 * the harmonics lock to whatever the instantaneous fundamental is doing.
 */
export const HARMONIC_PHASES: readonly number[] = [
  0, 0, 0.1727, -1.3818, -0.741, 0.5485, 0.2786, 0.6136, 0.871, -0.4484, 0.4159,
  0.0518, -0.7452, -0.7026, -0.9324, -0.7706, -0.3744, -1.6118, 1.8389, 1.5636,
  1.0136, 1.4904, -0.74, 0.1728, -1.6467, 1.8802, -0.676, -0.668, -0.6299,
  1.6353, 0.3211, -1.3503, 0.3075, 0.1591, 0.2525, 0.0245, -0.096, -0.4635,
  0.2632, 0.8101, -0.6598, -0.9305, -0.9242, -0.8656, 1.5343, 0.0474, -0.1217,
  -1.7261, 1.0355, 0.8368, -0.7735, -1.4819, -0.7513, -1.2034, -1.2971, 1.9845,
  -0.2711, 0.0921, 1.0395, 1.7211, 0.2757
]

/**
 * How the lower harmonics' balance changes over the tone: one gain per band
 * per time knot, `bands[band][knot]`. `TEXTURE_FRACTIONS` gives each knot's
 * position as a fraction of the tone; the renderer interpolates and clamps at
 * the ends.
 */
export const TEXTURE_FRACTIONS: readonly number[] = [
  20 / 115,
  40 / 115,
  60 / 115,
  80 / 115,
  100 / 115
]
export const TEXTURE_BANDS_HZ: readonly (readonly [number, number])[] = [
  [80, 700],
  [700, 1600],
  [1600, 2300],
  [2300, 5200]
]
export const TEXTURE_GAINS: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [1.0547, 0.8763, 1.082, 0.7139, 0.7043],
  [1.4445, 0.9571, 0.7233, 0.4995, 0.3677],
  [1.1761, 0.9582, 0.8874, 0.4168, 0.35]
]

/**
 * Harmonics above `HARMONIC_CUTOFF_HZ` use these fixed weights directly
 * instead of the `1 / n ** tilt` falloff, so the brighter, deliberately
 * emphasized upper band keeps its approved balance.
 */
export const UPPER_BANDS: readonly {
  readonly harmonics: readonly number[]
  readonly weights: readonly number[]
}[] = [
  {
    harmonics: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
    weights: [
      0.1396, 0.4215, 0.5929, 0.6828, 0.5999, 0.4636, 0.3853, 0.3855, 0.2297,
      0.1956, 0.1487
    ]
  },
  {
    harmonics: [
      43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60
    ],
    weights: [
      0.1298, 0.2367, 0.2803, 0.2071, 0.1374, 0.1067, 0.1967, 0.4003, 0.3807,
      0.5587, 0.7252, 0.598, 0.1624, 0.1793, 0.2682, 0.2845, 0.1371, 0.0753
    ]
  }
]
/** The upper band's own fade in and out, on top of the tone's envelope. */
export const UPPER_ATTACK_MS = 8
export const UPPER_RELEASE_MS = 12

/**
 * A reference-to-recording loudness ratio, resampled to knots across the
 * tone as a fraction of its length. Layered on top of `swell`/`hold`, this is
 * the fine rise-hold-fade shape the simple three-fraction envelope cannot
 * express on its own.
 */
export const BODY_ENVELOPE: readonly number[] = [
  0.8573, 0.9411, 0.9215, 0.8339, 0.7929, 0.804, 0.8307, 0.8691, 0.8851, 0.9065,
  0.967, 1.025, 1.081, 1.1813, 1.3082, 1.3952, 1.4675, 1.575, 1.6378, 1.5226,
  1.3048, 1.3722, 1.8334, 2
]

/**
 * Small, measured cycle-to-cycle pitch wobble, as a fraction of the
 * instantaneous fundamental at each knot (fraction of the tone).
 */
export const CYCLE_FRACTIONS: readonly number[] = [
  18 / 115,
  24 / 115,
  30 / 115,
  36 / 115,
  42 / 115,
  48 / 115,
  54 / 115,
  60 / 115,
  66 / 115,
  72 / 115,
  78 / 115,
  84 / 115,
  90 / 115,
  96 / 115
]
export const CYCLE_VARIATION: readonly number[] = [
  -0.0036, -0.0011, -0.002, -0.0012, 0.0012, -0.0011, -0.0047, -0.0035, -0.0049,
  -0.0004, 0.0057, 0.0083, -0.0018, -0.0096
]
