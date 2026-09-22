export const SAMPLE_RATE = 44_100

const BITS_PER_SAMPLE = 16
const CHANNELS = 1
const PEAK = 0x7fff

const ATTACK_MS = 4
const DECAY = 5.5
const HARMONIC_GAIN = 0.28
const NORMALIZE = 1 / 1.3

const voices = new Map<string, Float32Array>()

/**
 * Plucked sine in -1..1: short linear attack so there is no click on the
 * leading edge, exponential decay, a faster-decaying octave harmonic for the
 * transient, and a quartic taper to exact zero so the tail does not click either.
 */
const renderVoice = (frequency: number, toneMs: number): Float32Array => {
  const frames = Math.max(1, Math.round((SAMPLE_RATE * toneMs) / 1000))
  const attack = Math.max(1, Math.round((SAMPLE_RATE * ATTACK_MS) / 1000))
  const omega = (2 * Math.PI * frequency) / SAMPLE_RATE
  const samples = new Float32Array(frames)

  for (let i = 0; i < frames; i += 1) {
    const progress = i / frames
    const envelope = Math.min(1, i / attack) * Math.exp(-DECAY * progress) * (1 - progress ** 4)
    const wave =
      Math.sin(omega * i) + HARMONIC_GAIN * Math.sin(2 * omega * i) * Math.exp(-3 * progress)
    samples[i] = wave * NORMALIZE * envelope
  }

  return samples
}

/** Cached voice for a tone; there are only `scale.length * octaves` distinct ones. */
export const voice = (frequency: number, toneMs: number): Float32Array => {
  const key = `${Math.round(frequency)}-${Math.round(toneMs)}`
  const cached = voices.get(key)
  if (cached !== undefined) return cached

  const samples = renderVoice(frequency, toneMs)
  voices.set(key, samples)
  return samples
}

export const toInt16 = (sample: number): number =>
  Math.round(Math.max(-1, Math.min(1, sample)) * PEAK)

const wavHeader = (dataBytes: number): Buffer => {
  const header = Buffer.alloc(44)
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write("WAVE", 8, "ascii")
  header.write("fmt ", 12, "ascii")
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE((CHANNELS * BITS_PER_SAMPLE) / 8, 32)
  header.writeUInt16LE(BITS_PER_SAMPLE, 34)
  header.write("data", 36, "ascii")
  header.writeUInt32LE(dataBytes, 40)
  return header
}

export const encodeWav = (samples: Float32Array): Buffer => {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(toInt16(samples[i] ?? 0), i * 2)
  return Buffer.concat([wavHeader(data.length), data])
}
