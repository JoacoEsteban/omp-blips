import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SAMPLE_RATE = 44_100
const BITS_PER_SAMPLE = 16
const CHANNELS = 1
const PEAK = 0x7fff

const ATTACK_MS = 4
const DECAY = 5.5
const HARMONIC_GAIN = 0.28

const cacheDir = join(tmpdir(), "omp-blips")
const rendered = new Map<string, string>()

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

/**
 * Plucked sine: short linear attack so there is no click, exponential decay
 * plus a faster-decaying octave harmonic for the "blip" transient.
 */
const renderWav = (frequency: number, toneMs: number): Buffer => {
  const frames = Math.max(1, Math.round((SAMPLE_RATE * toneMs) / 1000))
  const attack = Math.max(1, Math.round((SAMPLE_RATE * ATTACK_MS) / 1000))
  const samples = Buffer.alloc(frames * 2)
  const omega = (2 * Math.PI * frequency) / SAMPLE_RATE

  for (let i = 0; i < frames; i += 1) {
    const progress = i / frames
    const envelope =
      Math.min(1, i / attack) * Math.exp(-DECAY * progress) * (1 - progress ** 4)
    const wave =
      Math.sin(omega * i) + HARMONIC_GAIN * Math.sin(2 * omega * i) * Math.exp(-3 * progress)
    samples.writeInt16LE(Math.round(Math.max(-1, Math.min(1, wave / 1.3)) * PEAK * envelope), i * 2)
  }

  return Buffer.concat([wavHeader(samples.length), samples])
}

/** Path of a cached WAV for this tone, rendering it on first use. */
export const toneFile = (frequency: number, toneMs: number): string => {
  const hz = Math.round(frequency)
  const key = `blip-${hz}-${Math.round(toneMs)}.wav`
  const cached = rendered.get(key)
  if (cached !== undefined) return cached

  const path = join(cacheDir, key)
  if (!existsSync(path)) {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(path, renderWav(frequency, toneMs))
  }
  rendered.set(key, path)
  return path
}
