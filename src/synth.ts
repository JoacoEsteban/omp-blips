export const SAMPLE_RATE = 44_100

const BITS_PER_SAMPLE = 16
const CHANNELS = 1
const PEAK = 0x7fff
const NYQUIST = SAMPLE_RATE / 2
const SOUND_VERSION = "modal-v1"
/** The maximum modal sum with firm excitation and attack noise stays below 1 / this gain. */
const ANALYTICAL_NORMALIZE = 0.55

export type Material = "wood" | "stone" | "ceramic" | "glass"
export type Touch = "soft" | "normal" | "firm"

export interface Sound {
	readonly frequency: number
	readonly toneMs: number
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

const MATERIAL_MODES: Readonly<Record<Material, readonly ResonanceMode[]>> = {
	wood: [
		{ ratio: 1, gain: 0.9, decay: 4.5 },
		{ ratio: 1.99, gain: 0.18, decay: 8 },
		{ ratio: 3.01, gain: 0.08, decay: 11 },
	],
	stone: [
		{ ratio: 1, gain: 0.84, decay: 5.4 },
		{ ratio: 2.67, gain: 0.22, decay: 7.6 },
		{ ratio: 4.45, gain: 0.1, decay: 10.2 },
	],
	ceramic: [
		{ ratio: 1, gain: 0.72, decay: 3.4 },
		{ ratio: 2.03, gain: 0.32, decay: 4.8 },
		{ ratio: 3.17, gain: 0.2, decay: 6.5 },
		{ ratio: 4.2, gain: 0.1, decay: 8 },
	],
	glass: [
		{ ratio: 1, gain: 0.65, decay: 2.6 },
		{ ratio: 2.01, gain: 0.4, decay: 3.4 },
		{ ratio: 3.07, gain: 0.3, decay: 4.5 },
		{ ratio: 4.15, gain: 0.2, decay: 5.4 },
		{ ratio: 5.3, gain: 0.12, decay: 6.2 },
	],
}

const TOUCH_PROFILES: Readonly<Record<Touch, TouchProfile>> = {
	soft: { attackMs: 8, upperModeGain: 0.35, noiseStrength: 0.015 },
	normal: { attackMs: 4, upperModeGain: 0.65, noiseStrength: 0.03 },
	firm: { attackMs: 1.8, upperModeGain: 0.95, noiseStrength: 0.05 },
}

const voices = new Map<string, Float32Array>()

const seedFor = (key: string): number => {
	let hash = 2_166_136_261
	for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
	const seed = hash >>> 0
	if (seed === 0) return 1
	return seed
}

/** Render restrained modal resonances with a deterministic filtered-noise attack. */
const renderVoice = (sound: Sound): Float32Array => {
	const frequency = sound.frequency
	const frames = Math.max(1, Math.round((SAMPLE_RATE * sound.toneMs) / 1000))
	const profile = TOUCH_PROFILES[sound.touch]
	const modes = MATERIAL_MODES[sound.material]
		.filter((mode) => mode.ratio * frequency < NYQUIST)
		.map((mode, index) => {
			let excitation = profile.upperModeGain
			if (index === 0) excitation = 1
			return {
				phase: 0,
				phaseStep: (2 * Math.PI * mode.ratio * frequency) / SAMPLE_RATE,
				gain: mode.gain * excitation,
				decayStep: Math.exp(-mode.decay / Math.max(1, frames - 1)),
				decay: 1,
			}
		})
	const attackFrames = Math.max(1, Math.round((SAMPLE_RATE * profile.attackMs) / 1000))
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

	for (let i = 1; i < frames - 1; i += 1) {
		const progress = i / (frames - 1)
		const attack = Math.min(1, i / attackFrames)
		const tail = 1 - progress
		let resonances = 0
		for (const mode of modes) {
			resonances += Math.sin(mode.phase) * mode.gain * mode.decay
			mode.phase += mode.phaseStep
			mode.decay *= mode.decayStep
		}

		filteredNoise += 0.18 * (nextNoise() - filteredNoise)
		const noiseEnvelope = noiseDecay * attack
		const sample = (resonances + filteredNoise * profile.noiseStrength * noiseEnvelope) *
			ANALYTICAL_NORMALIZE * attack * tail
		samples[i] = sample
		noiseDecay *= noiseDecayStep
	}

	return samples
}

export const soundKey = (sound: Sound): string =>
	`${SOUND_VERSION}:${String(sound.frequency)}:${String(sound.toneMs)}:${sound.material}:${sound.touch}`

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
	header.write("RIFF", 0, "ascii")
	header.writeUInt32LE(36 + dataBytes, 4)
	header.write("WAVE", 8, "ascii")
	header.write("fmt ", 12, "ascii")
	header.writeUInt32LE(16, 16)
	header.writeUInt16LE(1, 20)
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

