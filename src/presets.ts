import type { ConfigPatch } from "./config.ts"
import { BLUES, HIRAJOSHI, KUMOI, MAJOR_PENTATONIC, MINOR_PENTATONIC } from "./scales.ts"

export type PresetName =
	| "default"
	| "arcade"
	| "gamelan"
	| "sonar"
	| "typewriter"
	| "music-box"
	| "quiet"

export interface Preset {
	/** One line, shown by `/blips presets`. */
	readonly description: string
	readonly patch: ConfigPatch
}

/**
 * A preset is a named `ConfigPatch` laid over the defaults, under whatever a
 * config file says. Each one is a different answer to the same question: what
 * should a stream of characters sound like?
 */
export const presets: Record<PresetName, Preset> = {
	default: {
		description: "Prose melody, dark reasoning murmur, bright tool ticks.",
		patch: {},
	},

	// Square-wave era: small intervals, fast, everything in the top half of the
	// keyboard. The 2-character rate makes prose sound like a text crawl.
	arcade: {
		description: "Chiptune. Fast, high, small tones — a text crawl in a 1988 cutscene.",
		patch: {
			minIntervalMs: 45,
			voices: {
				text: {
					charsPerBlip: 2,
					toneMs: 34,
					volume: 0.28,
					baseFrequency: 440,
					scale: MAJOR_PENTATONIC,
					octaves: 3,
					mapping: "wrap",
				},
				thinking: {
					charsPerBlip: 3,
					toneMs: 40,
					volume: 0.24,
					baseFrequency: 220,
					scale: BLUES,
					octaves: 2,
					mapping: "wrap",
				},
				tool: {
					charsPerBlip: 4,
					toneMs: 18,
					volume: 0.2,
					baseFrequency: 880,
					scale: MAJOR_PENTATONIC,
					octaves: 2,
					mapping: "wrap",
				},
			},
		},
	},

	// Long decays that overlap into each other. The tone cache makes this cheap,
	// and the ffplay mixer is what lets the tails actually ring together.
	gamelan: {
		description: "Struck metal. Long ringing tones that overlap into a haze.",
		patch: {
			minIntervalMs: 150,
			voices: {
				text: {
					charsPerBlip: 6,
					toneMs: 260,
					volume: 0.3,
					baseFrequency: 415.3,
					scale: HIRAJOSHI,
					octaves: 2,
					mapping: "fold",
				},
				thinking: {
					charsPerBlip: 8,
					toneMs: 420,
					volume: 0.26,
					baseFrequency: 155.56,
					scale: KUMOI,
					octaves: 2,
					mapping: "fold",
				},
				tool: {
					charsPerBlip: 10,
					toneMs: 130,
					volume: 0.18,
					baseFrequency: 830.61,
					scale: HIRAJOSHI,
					octaves: 2,
					mapping: "wrap",
				},
			},
		},
	},

	// One octave, very sparse, very slow. You stop hearing letters and start
	// hearing whether the agent is alive.
	sonar: {
		description: "Submarine. One slow ping every few words, nothing else.",
		patch: {
			minIntervalMs: 420,
			voices: {
				text: {
					charsPerBlip: 14,
					toneMs: 320,
					volume: 0.34,
					baseFrequency: 174.61,
					scale: MINOR_PENTATONIC,
					octaves: 1,
					mapping: "fold",
				},
				thinking: {
					charsPerBlip: 18,
					toneMs: 440,
					volume: 0.3,
					baseFrequency: 98,
					scale: MINOR_PENTATONIC,
					octaves: 1,
					mapping: "fold",
				},
				tool: {
					charsPerBlip: 20,
					toneMs: 220,
					volume: 0.24,
					baseFrequency: 261.63,
					scale: MINOR_PENTATONIC,
					octaves: 1,
					mapping: "wrap",
				},
			},
		},
	},

	// Almost no pitch range: the ear reads it as rhythm, not melody. Closest
	// thing to hearing a person type in the next room.
	typewriter: {
		description: "Mechanical keys. Near-flat pitch, all rhythm.",
		patch: {
			minIntervalMs: 42,
			voices: {
				text: {
					charsPerBlip: 2,
					toneMs: 20,
					volume: 0.22,
					baseFrequency: 987.77,
					scale: MAJOR_PENTATONIC,
					octaves: 1,
					mapping: "fold",
				},
				thinking: {
					charsPerBlip: 3,
					toneMs: 24,
					volume: 0.18,
					baseFrequency: 493.88,
					scale: MINOR_PENTATONIC,
					octaves: 1,
					mapping: "fold",
				},
				tool: {
					charsPerBlip: 3,
					toneMs: 16,
					volume: 0.2,
					baseFrequency: 1318.51,
					scale: MAJOR_PENTATONIC,
					octaves: 1,
					mapping: "wrap",
				},
			},
		},
	},

	// High, sweet, stepwise. `fold` everywhere, because leaps break the illusion.
	"music-box": {
		description: "Wind-up music box. High, sweet, stepwise phrases.",
		patch: {
			minIntervalMs: 95,
			voices: {
				text: {
					charsPerBlip: 4,
					toneMs: 150,
					volume: 0.26,
					baseFrequency: 1046.5,
					scale: KUMOI,
					octaves: 2,
					mapping: "fold",
				},
				thinking: {
					charsPerBlip: 5,
					toneMs: 210,
					volume: 0.22,
					baseFrequency: 523.25,
					scale: KUMOI,
					octaves: 2,
					mapping: "fold",
				},
				tool: {
					charsPerBlip: 8,
					toneMs: 90,
					volume: 0.16,
					baseFrequency: 1567.98,
					scale: MAJOR_PENTATONIC,
					octaves: 1,
					mapping: "fold",
				},
			},
		},
	},

	// For shared rooms and long sessions: prose only, low gain, wide spacing.
	quiet: {
		description: "Background. Prose only, low gain, wide spacing.",
		patch: {
			minIntervalMs: 190,
			voices: {
				text: { charsPerBlip: 7, toneMs: 70, volume: 0.14, mapping: "fold" },
				thinking: { charsPerBlip: 10, toneMs: 110, volume: 0.1 },
				tool: { enabled: false },
			},
		},
	},
}

export const presetNames = Object.keys(presets) as readonly PresetName[]
