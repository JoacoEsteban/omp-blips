/**
 * The Sans voice, as one `VocalProfile`: the fit of the approved audition
 * candidate against `voice_sans.mp3`. Every number is a compact, resampled
 * summary of that fit, not a copy of the recording - `vocal.ts` still renders
 * every sample at request time from these controls.
 *
 * The file is one exported value, built through the constructors of
 * `curve.ts` and `vocal.ts`. Each of them pairs the measurements with the
 * grid they were taken on, so no two lists here have to be kept in step by
 * hand: `atKnots` checks every harmonic row against the shared time grid,
 * `measured` derives its knots from the count of values, `spread` and
 * `band` derive theirs from the values themselves.
 *
 * The measurement behind the harmonic curves: 14th-order LPC (bandwidth-
 * expanded to damp narrow-window numerical spikes), 24 ms Hamming windows
 * every 6 ms, spectral envelope read at each harmonic's instantaneous
 * frequency (from `chirp`) and normalized to the fundamental at that same
 * instant. It replaces separately fitting formants, a source tilt, one
 * hand-picked formant glide, and a coarse 4-band texture curve: all of that
 * shape is a single side effect of the vocal tract moving, so it comes from
 * one measurement instead of several independent approximations of it.
 * `color` therefore articulates nothing here - the fit is a single recorded
 * vowel, not a family of vowels, so there is nothing to sweep to.
 */

import { measured, spread } from './curve.ts'
import { band, type VocalProfile } from './vocal.ts'

/** The blip the fit was measured from, in milliseconds. */
const DURATION_MS = 115

/**
 * The LPC windows the harmonic curves were read on: the first centred 8 ms
 * into the blip, one every 6 ms after it. The knots follow the count of
 * values, so a row cannot drift off the grid.
 */
const atKnots = measured({ startMs: 8, everyMs: 6, durationMs: DURATION_MS })

/** The pitch windows: one every 6 ms from 18 ms into the blip. */
const perWindow = measured({ startMs: 18, everyMs: 6, durationMs: DURATION_MS })

export const sansProfile: VocalProfile = {
  frequency: 164.81,
  durationS: DURATION_MS / 1000,

  /**
   * The fundamental rises across the tone instead of holding steady. Fitted
   * as a line through six windows of the candidate; the endpoints
   * extrapolate from interior estimates.
   */
  chirp: {
    startHz: 158.0679,
    slopeHzPerSecond: 130.3714
  },

  /** One curve for each harmonic from the first, relative to the fundamental. */
  harmonics: [
    atKnots([
      1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
      1.0, 1.0, 1.0, 1.0
    ]),
    atKnots([
      0.8909, 0.9125, 0.9625, 1.001, 1.0222, 1.1973, 1.2869, 1.3241, 1.3541,
      1.4546, 1.5245, 1.6141, 1.5488, 1.1668, 0.8763, 0.6955, 0.5014, 0.522,
      0.6704
    ]),
    atKnots([
      0.8631, 0.8521, 0.8164, 0.5811, 0.4545, 0.3769, 0.3483, 0.3243, 0.2929,
      0.2748, 0.2637, 0.2633, 0.2599, 0.2167, 0.1827, 0.1666, 0.1445, 0.1927,
      0.2915
    ]),
    atKnots([
      0.332, 0.3175, 0.2989, 0.2318, 0.1897, 0.1619, 0.1507, 0.1415, 0.1306,
      0.1228, 0.1178, 0.1177, 0.1172, 0.1014, 0.0904, 0.0862, 0.0789, 0.1143,
      0.1773
    ]),
    atKnots([
      0.2003, 0.192, 0.1861, 0.1508, 0.126, 0.1126, 0.1056, 0.0996, 0.0932,
      0.0878, 0.084, 0.0842, 0.0845, 0.0741, 0.0692, 0.0688, 0.0652, 0.1036,
      0.1697
    ]),
    atKnots([
      0.1734, 0.1665, 0.1667, 0.1385, 0.1167, 0.1103, 0.1048, 0.0991, 0.094,
      0.0885, 0.0842, 0.0851, 0.0862, 0.0761, 0.0757, 0.0804, 0.0788, 0.1397,
      0.2395
    ]),
    atKnots([
      0.2085, 0.2006, 0.209, 0.1782, 0.1519, 0.1561, 0.154, 0.1467, 0.1423,
      0.1337, 0.126, 0.129, 0.1316, 0.1174, 0.13, 0.159, 0.1526, 0.1893, 0.2477
    ]),
    atKnots([
      0.3665, 0.3575, 0.3816, 0.3437, 0.3087, 0.3543, 0.4139, 0.4425, 0.4705,
      0.465, 0.4325, 0.4381, 0.3464, 0.3225, 0.3472, 0.2641, 0.1826, 0.1553,
      0.2243
    ]),
    atKnots([
      0.4099, 0.414, 0.3988, 0.3286, 0.2846, 0.2525, 0.2341, 0.2308, 0.2278,
      0.2201, 0.2147, 0.2105, 0.193, 0.1831, 0.1855, 0.1542, 0.1375, 0.168,
      0.1651
    ]),
    atKnots([
      0.2751, 0.2746, 0.282, 0.2252, 0.1867, 0.1804, 0.1639, 0.1577, 0.1575,
      0.1493, 0.1443, 0.1499, 0.1548, 0.1569, 0.1982, 0.1922, 0.1596, 0.0764,
      0.063
    ]),
    atKnots([
      0.3139, 0.3167, 0.3411, 0.2679, 0.2187, 0.2265, 0.2067, 0.1984, 0.1991,
      0.19, 0.1875, 0.212, 0.2432, 0.2429, 0.1519, 0.1074, 0.0726, 0.05, 0.05
    ]),
    atKnots([
      0.659, 0.722, 0.7997, 0.6522, 0.5232, 0.514, 0.442, 0.3547, 0.3219,
      0.4052, 0.3903, 0.324, 0.2112, 0.1188, 0.072, 0.0535, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.2397, 0.2427, 0.2996, 0.2768, 0.227, 0.2671, 0.2352, 0.189, 0.1907,
      0.2364, 0.1919, 0.1473, 0.1045, 0.0692, 0.0531, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.1334, 0.1368, 0.1758, 0.1622, 0.1341, 0.1682, 0.1562, 0.1317, 0.1412,
      0.1684, 0.1423, 0.1164, 0.0862, 0.0643, 0.0579, 0.05, 0.05, 0.05, 0.06
    ]),
    atKnots([
      0.1135, 0.1203, 0.1605, 0.1548, 0.1323, 0.1663, 0.1613, 0.1364, 0.1485,
      0.1866, 0.1781, 0.1485, 0.1082, 0.0952, 0.0984, 0.0745, 0.05, 0.0501, 0.05
    ]),
    atKnots([
      0.1355, 0.1521, 0.2071, 0.2235, 0.2126, 0.2433, 0.2371, 0.1939, 0.2042,
      0.2663, 0.3611, 0.3136, 0.212, 0.1429, 0.1126, 0.0731, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.2484, 0.3043, 0.3711, 0.4797, 0.5098, 0.4995, 0.4145, 0.3327, 0.3436,
      0.3692, 0.3311, 0.2608, 0.1576, 0.0771, 0.0551, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.491, 0.4621, 0.3512, 0.2808, 0.2701, 0.2229, 0.17, 0.1647, 0.1648,
      0.188, 0.2132, 0.1501, 0.0845, 0.0515, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.2054, 0.1965, 0.1364, 0.1014, 0.1118, 0.0877, 0.0613, 0.0608, 0.062,
      0.0676, 0.074, 0.0667, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.0865, 0.0727, 0.057, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.0644, 0.0681, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.0571, 0.0659, 0.0707, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ]),
    atKnots([
      0.0719, 0.0613, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
      0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05
    ])
  ],

  /** Harmonics above this take their weight from `upper.bands` instead. */
  cutoffHz: 5200,

  /**
   * Relative phase by harmonic number, 1-based; index 0 unused. The
   * harmonic-number multiple of the fundamental's own phase is already
   * removed, and `vocal.ts` adds it back at request time, so the harmonics
   * lock to whatever the instantaneous fundamental is doing.
   */
  phases: [
    0, 0, 0.1727, -1.3818, -0.741, 0.5485, 0.2786, 0.6136, 0.871, -0.4484,
    0.4159, 0.0518, -0.7452, -0.7026, -0.9324, -0.7706, -0.3744, -1.6118,
    1.8389, 1.5636, 1.0136, 1.4904, -0.74, 0.1728, -1.6467, 1.8802, -0.676,
    -0.668, -0.6299, 1.6353, 0.3211, -1.3503, 0.3075, 0.1591, 0.2525, 0.0245,
    -0.096, -0.4635, 0.2632, 0.8101, -0.6598, -0.9305, -0.9242, -0.8656, 1.5343,
    0.0474, -0.1217, -1.7261, 1.0355, 0.8368, -0.7735, -1.4819, -0.7513,
    -1.2034, -1.2971, 1.9845, -0.2711, 0.0921, 1.0395, 1.7211, 0.2757
  ],

  /**
   * The brighter runs above `cutoffHz`, which keep their approved balance
   * through fixed weights instead of measured curves.
   */
  upper: {
    bands: [
      band(
        32,
        1,
        [
          0.1396, 0.4215, 0.5929, 0.6828, 0.5999, 0.4636, 0.3853, 0.3855,
          0.2297, 0.1956, 0.1487
        ]
      ),
      band(
        43,
        0.77,
        [
          0.1298, 0.2367, 0.2803, 0.2071, 0.1374, 0.1067, 0.1967, 0.4003,
          0.3807, 0.5587, 0.7252, 0.598, 0.1624, 0.1793, 0.2682, 0.2845, 0.1371,
          0.0753
        ]
      )
    ],
    gain: 0.4,
    attackMs: 8
  },

  lowerTrim: 0.9,
  /** Slower than the generic modal materials: this candidate rings longer. */
  modalDecay: 0.66,
  roughness: 0.0015,

  /**
   * A reference-to-recording loudness ratio across the tone. Layered on top
   * of `swell` and `hold`, this is the fine rise-hold-fade shape the simple
   * three-fraction envelope cannot express on its own.
   */
  body: spread([
    0.8573, 0.9411, 0.9215, 0.8339, 0.7929, 0.804, 0.8307, 0.8691, 0.8851,
    0.9065, 0.967, 1.025, 1.081, 1.1813, 1.3082, 1.3952, 1.4675, 1.575, 1.6378,
    1.5226, 1.3048, 1.3722, 1.8334, 2
  ]),

  /**
   * Cycle-to-cycle pitch wobble, as a fraction of the instantaneous
   * fundamental at each pitch window.
   */
  cycle: perWindow([
    -0.0036, -0.0011, -0.002, -0.0012, 0.0012, -0.0011, -0.0047, -0.0035,
    -0.0049, -0.0004, 0.0057, 0.0083, -0.0018, -0.0096
  ])
}
