import { match } from 'ts-pattern'

export const SAMPLE_RATE = 44_100

const BITS_PER_SAMPLE = 16
const CHANNELS = 1
const PEAK = 0x7fff
const NYQUIST = SAMPLE_RATE / 2
const SOUND_VERSION = 'formant-v4'
/** Nominal level of the modal sum, before the ceiling is enforced. */
const VOICE_GAIN = 0.55
/** No rendered sample passes this level, whatever the material and touch are. */
const CEILING = 0.92
/** Fade at the end of the buffer, so the modal tail stops without a click. */
const RELEASE_MS = 12
const RELEASE_FRAMES = Math.max(
  1,
  Math.round((SAMPLE_RATE * RELEASE_MS) / 1000)
)

/**
 * What is resonating. The first four are struck objects: inharmonic partials
 * over a short impulse. `reed` and `brass` are sustained tones with harmonic
 * partials and almost no decay of their own — the spectra a voice needs, which
 * a struck object cannot produce however long its tone is held.
 */
export type Material = 'wood' | 'stone' | 'ceramic' | 'glass' | 'reed' | 'brass'
export type Touch = 'soft' | 'normal' | 'firm'

export interface Sound {
  readonly frequency: number
  readonly toneMs: number
  /** Multiplier for the material decay rate; lower values sustain longer. */
  readonly decay: number
  /** Fraction of the tone spent rising to full level; 0 leaves the touch's attack. */
  readonly swell: number
  /** Fraction of the tone held at full body before the decay starts, 0..1. */
  readonly hold: number
  /** Semitones the pitch falls across the tone; 0 is a steady pitch. */
  readonly glide: number
  /**
   * Where the second formant sits inside its sweep, 0..1. Only a sustained
   * material reads it; a struck one has no tract to move.
   */
  readonly color: number
  readonly material: Material
  readonly touch: Touch
}

interface ResonanceMode {
  readonly ratio: number
  readonly gain: number
  readonly decay: number
}

interface TouchProfile {
  readonly attackMs: number
  readonly upperModeGain: number
  readonly noiseStrength: number
}

interface Formant {
  /** Centre of the resonance, in Hz, independent of the pitch. */
  readonly hz: number
  /** Width at 3 dB down, in Hz. Narrow rings, wide colours. */
  readonly bw: number
  readonly gain: number
}

interface Tract {
  /** 1 voices every harmonic, 2 only the odd ones. */
  readonly step: number
  /** Fall of the source spectrum, as `1 / n ** tilt`. */
  readonly tilt: number
  readonly formants: readonly Formant[]
  /** How far `color` slides the second formant, in Hz. */
  readonly sweep: number
}

/**
 * The two sustained materials are a source and a filter, the way a voice is: a
 * harmonic source at the pitch, shaped by resonances that stay where they are
 * when the pitch moves. That fixed-in-Hz behaviour is what separates a vowel
 * from a synthesizer patch, and it is the one thing a struck material cannot
 * do — its partials are inharmonic and its brightness dies with the strike.
 */
const TRACTS: Readonly<Record<'reed' | 'brass', Tract>> = {
  // Close and narrow: odd harmonics only, under a low first resonance and a
  // second one that barely moves. The darker of the two.
  reed: {
    step: 2,
    tilt: 0.6,
    formants: [
      { hz: 320, bw: 110, gain: 1 },
      { hz: 1500, bw: 220, gain: 1.6 },
      { hz: 2600, bw: 240, gain: 1 }
    ],
    sweep: 260
  },
  // A close rounded vowel: a low first formant, a second front of centre, and
  // a third wide enough to stay bright without ringing. The source falls
  // gently rather than as 1/n, because a steep source buries the upper
  // formants and the tone collapses back into a hum.
  brass: {
    step: 1,
    tilt: 0.4,
    formants: [
      { hz: 290, bw: 90, gain: 1 },
      { hz: 1730, bw: 200, gain: 2.5 },
      { hz: 2790, bw: 200, gain: 2 }
    ],
    sweep: 460
  }
}

/** Magnitude of one two-pole resonance at a frequency. */
const resonance = (hz: number, formant: Formant): number =>
  (formant.gain * (formant.hz * formant.bw)) /
  Math.sqrt((formant.hz ** 2 - hz ** 2) ** 2 + (hz * formant.bw) ** 2)

/**
 * A harmonic source read through the tract. `color` slides the second formant
 * across its sweep, which is the articulation: consecutive tones become
 * different vowels instead of the same one at a different pitch.
 */
const voiced = (
  tract: Tract,
  frequency: number,
  color: number
): readonly ResonanceMode[] => {
  const formants = tract.formants.map((formant, index) =>
    match(index)
      .with(1, () => ({
        ...formant,
        hz: formant.hz + (color - 0.5) * tract.sweep
      }))
      .otherwise(() => formant)
  )
  const modes: ResonanceMode[] = []
  for (let ratio = 1; ratio * frequency < 5200; ratio += tract.step) {
    const hz = ratio * frequency
    const shaped = formants.reduce(
      (sum, formant) => sum + resonance(hz, formant),
      0
    )
    modes.push({
      ratio,
      gain: (0.9 / ratio ** tract.tilt) * shaped,
      // Upper partials fade first, as they do in any sustained tone. `hold`
      // decides how much of that fade is heard at all.
      decay: 0.5 + ratio * 0.08
    })
  }
  return modes
}

const MATERIAL_MODES: Readonly<
  Record<Exclude<Material, 'reed' | 'brass'>, readonly ResonanceMode[]>
> = {
  wood: [
    { ratio: 1, gain: 0.9, decay: 4.5 },
    { ratio: 1.99, gain: 0.18, decay: 8 },
    { ratio: 3.01, gain: 0.08, decay: 11 }
  ],
  stone: [
    { ratio: 1, gain: 0.84, decay: 5.4 },
    { ratio: 2.67, gain: 0.22, decay: 7.6 },
    { ratio: 4.45, gain: 0.1, decay: 10.2 }
  ],
  ceramic: [
    { ratio: 1, gain: 0.72, decay: 3.4 },
    { ratio: 2.03, gain: 0.32, decay: 4.8 },
    { ratio: 3.17, gain: 0.2, decay: 6.5 },
    { ratio: 4.2, gain: 0.1, decay: 8 }
  ],
  glass: [
    { ratio: 1, gain: 0.65, decay: 2.6 },
    { ratio: 2.01, gain: 0.4, decay: 3.4 },
    { ratio: 3.07, gain: 0.3, decay: 4.5 },
    { ratio: 4.15, gain: 0.2, decay: 5.4 },
    { ratio: 5.3, gain: 0.12, decay: 6.2 }
  ]
}

/** The partials of one sound, struck or voiced. */
const modesOf = (sound: Sound): readonly ResonanceMode[] =>
  match(sound.material)
    .with('reed', 'brass', (name) =>
      voiced(TRACTS[name], sound.frequency, sound.color)
    )
    .otherwise((name) => MATERIAL_MODES[name])

const TOUCH_PROFILES: Readonly<Record<Touch, TouchProfile>> = {
  soft: { attackMs: 8, upperModeGain: 0.35, noiseStrength: 0.015 },
  normal: { attackMs: 4, upperModeGain: 0.65, noiseStrength: 0.03 },
  firm: { attackMs: 1.8, upperModeGain: 0.95, noiseStrength: 0.05 }
}

const voices = new Map<string, Float32Array>()

const seedFor = (key: string): number => {
  let hash = 2_166_136_261
  for (const character of key)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  const seed = hash >>> 0
  if (seed === 0) return 1
  return seed
}

/** Render restrained modal resonances with a deterministic filtered-noise attack. */
const renderVoice = (sound: Sound): Float32Array => {
  const frequency = sound.frequency
  const frames = Math.max(1, Math.round((SAMPLE_RATE * sound.toneMs) / 1000))
  const profile = TOUCH_PROFILES[sound.touch]
  const modes = modesOf(sound)
    .filter((mode) => mode.ratio * frequency < NYQUIST)
    .map((mode, index) => {
      let excitation = profile.upperModeGain
      if (index === 0) excitation = 1
      return {
        phase: 0,
        phaseStep: (2 * Math.PI * mode.ratio * frequency) / SAMPLE_RATE,
        gain: mode.gain * excitation,
        decayStep: Math.exp(
          -(mode.decay * sound.decay) / Math.max(1, frames - 1)
        ),
        decay: 1
      }
    })
  const attackFrames = Math.max(
    1,
    Math.round((SAMPLE_RATE * profile.attackMs) / 1000)
  )
  const samples = new Float32Array(frames)
  const key = soundKey(sound)
  let noiseState = seedFor(key)
  const noiseDecayStep = Math.exp(-32 / Math.max(1, frames - 1))
  let noiseDecay = 1
  let filteredNoise = 0

  const nextNoise = (): number => {
    noiseState ^= noiseState << 13
    noiseState ^= noiseState >>> 17
    noiseState ^= noiseState << 5
    return ((noiseState >>> 0) / 4_294_967_295) * 2 - 1
  }

  if (frames <= 2) return samples

  /** Frames 0 and `last` stay at zero, so the buffer starts and ends on silence. */
  const last = frames - 1
  /** A short tone keeps at least half its length at full body. */
  const releaseFrames = Math.max(
    1,
    Math.min(RELEASE_FRAMES, Math.floor(last / 2))
  )
  const releaseStart = last - releaseFrames
  /** While a tone is held, the modal decay does not advance at all. */
  const holdFrames = Math.round(Math.min(1, Math.max(0, sound.hold)) * last)
  /**
   * One geometric slide from `glide` semitones above the nominal frequency down
   * to it, so a frame costs one multiplication instead of a `pow`. A glide of
   * zero leaves the factor at 1 and the pitch steady.
   */
  const glideFrom = 2 ** (sound.glide / 12)
  const glideStep = (1 / glideFrom) ** (1 / last)
  let bend = glideFrom
  /**
   * The rise. A swell of zero leaves the touch's attack, and any larger value
   * stretches it over that fraction of the tone: the sound arrives instead of
   * starting. The attack noise keeps the touch's own short ramp, so a slow
   * swell does not smear the onset noise across the whole tone.
   */
  const riseFrames = Math.max(
    attackFrames,
    Math.round(Math.min(1, Math.max(0, sound.swell)) * last)
  )
  let peak = 0

  for (let i = 1; i < last; i += 1) {
    const attack = Math.min(1, i / riseFrames)
    const onset = Math.min(1, i / attackFrames)
    const releaseProgress = Math.max(0, (i - releaseStart) / releaseFrames)
    const release = 0.5 * (1 + Math.cos(Math.PI * releaseProgress))
    let resonances = 0
    for (const mode of modes) {
      resonances += Math.sin(mode.phase) * mode.gain * mode.decay
      mode.phase += mode.phaseStep * bend
      if (i > holdFrames) mode.decay *= mode.decayStep
    }
    bend *= glideStep

    filteredNoise += 0.18 * (nextNoise() - filteredNoise)
    const noiseEnvelope = noiseDecay * onset
    const sample =
      (resonances + filteredNoise * profile.noiseStrength * noiseEnvelope) *
      VOICE_GAIN *
      attack *
      release
    samples[i] = sample
    peak = Math.max(peak, Math.abs(sample))
    noiseDecay *= noiseDecayStep
  }

  if (peak <= CEILING) return samples

  /** Only a material or touch loud enough to clip pays for this pass. */
  const limit = CEILING / peak
  for (const [index, value] of samples.entries()) samples[index] = value * limit
  return samples
}

export const soundKey = (sound: Sound): string =>
  `${SOUND_VERSION}:${String(sound.frequency)}:${String(sound.toneMs)}:${String(sound.decay)}:${String(sound.swell)}:${String(sound.hold)}:${String(sound.glide)}:${String(sound.color)}:${sound.material}:${sound.touch}`

/** Cached voice for a complete sound identity. */
export const voice = (sound: Sound): Float32Array => {
  const key = soundKey(sound)
  const cached = voices.get(key)
  if (cached !== undefined) return cached

  const samples = renderVoice(sound)
  voices.set(key, samples)
  return samples
}

export const toInt16 = (sample: number): number =>
  Math.round(Math.max(-1, Math.min(1, sample)) * PEAK)

const wavHeader = (dataBytes: number): Buffer => {
  const header = Buffer.alloc(44)
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE((CHANNELS * BITS_PER_SAMPLE) / 8, 32)
  header.writeUInt16LE(BITS_PER_SAMPLE, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return header
}

export const encodeWav = (samples: Float32Array): Buffer => {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i += 1)
    data.writeInt16LE(toInt16(samples[i] ?? 0), i * 2)
  return Buffer.concat([wavHeader(data.length), data])
}
