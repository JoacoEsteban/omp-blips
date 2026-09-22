import { parseAnsiToSurface } from "@flyingrobots/bijou"
import { chalkStyle, startApp } from "@flyingrobots/bijou-node"
import { isKeyMsg, quit, type App, type Cmd } from "@flyingrobots/bijou-tui"
import { match } from "ts-pattern"
import type { BlipConfig } from "../src/config.ts"
import { pitchFromCharacter } from "../src/pitch.ts"
import type { Player, Tone } from "../src/player.ts"
import { createFfplayPlayer } from "../src/players/ffplay.ts"
import { type PresetName, presetNames, presets } from "../src/presets.ts"
import { loadSettings } from "../src/settings.ts"
import type { Material } from "../src/synth.ts"

const STREAM_TEXT =
	"The quick brown fox jumps over the lazy dog while a steady stream of tokens passes through the terminal. "
const DEFAULT_STREAM_DELAY_MS = 10
const MIN_STREAM_DELAY_MS = 1
const MAX_STREAM_DELAY_MS = 1_000
const STREAM_SPEED_JUMPS = 50
const DEFAULT_WIDTH = 100
const DEFAULT_HEIGHT = 24
const MATERIALS: readonly Material[] = ["wood", "stone", "ceramic", "glass"]

const style = chalkStyle()
const accent = (text: string): string => style.bold(style.hex("#22d3ee", text))
const selected = (text: string): string => style.bold(style.hex("#fbbf24", `[${text}]`))
const muted = (text: string): string => style.hex("#64748b", text)

interface Model {
	readonly width: number
	readonly height: number
	readonly presetIndex: number
	readonly materialIndex: number
	readonly config: BlipConfig
	readonly pending: number
	readonly streamSpeedIndex: number
	readonly streamOffset: number
	readonly streamed: string
	readonly paused: boolean
}

type Msg = { readonly type: "stream-character" }

interface AuditionPlayer {
	readonly configure: (config: BlipConfig) => void
	readonly play: (tone: Tone) => void
	readonly dispose: () => void
}

const createAuditionPlayer = (initial: BlipConfig): AuditionPlayer => {
	const player: Player = createFfplayPlayer({ idleMs: Number.POSITIVE_INFINITY })
	let minIntervalMs = initial.minIntervalMs
	let lastPlayedAt = 0

	return {
		configure: (config) => {
			minIntervalMs = config.minIntervalMs
			lastPlayedAt = 0
		},
		play: (tone) => {
			const now = performance.now()
			if (now - lastPlayedAt < minIntervalMs) return
			lastPlayedAt = now
			player.play(tone)
		},
		dispose: () => player.dispose(),
	}
}

const configFor = (preset: PresetName, material: Material): BlipConfig => {
	const { config } = loadSettings(process.cwd(), preset)
	return {
		...config,
		voices: {
			...config.voices,
			text: { ...config.voices.text, material },
		},
	}
}

const cycle = (current: number, delta: number, length: number): number =>
	(current + delta + length) % length

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(Math.max(value, minimum), maximum)

const streamDelayMs = (speedIndex: number): number =>
	Math.ceil(
		MAX_STREAM_DELAY_MS * (MIN_STREAM_DELAY_MS / MAX_STREAM_DELAY_MS) **
		(clamp(speedIndex, 0, STREAM_SPEED_JUMPS) / STREAM_SPEED_JUMPS),
	)

const speedIndexForDelay = (delayMs: number): number =>
	Math.round(
		(Math.log(delayMs / MAX_STREAM_DELAY_MS) / Math.log(MIN_STREAM_DELAY_MS / MAX_STREAM_DELAY_MS)) *
		STREAM_SPEED_JUMPS,
	)

const DEFAULT_STREAM_SPEED_INDEX = speedIndexForDelay(DEFAULT_STREAM_DELAY_MS)

const streamCmd = (delayMs: number): Cmd<Msg> => (emit, capabilities) => {
	const sleep = (ms: number): Promise<void> => {
		if (capabilities.sleep !== undefined) return capabilities.sleep(ms)
		const { promise, resolve } = Promise.withResolvers<void>()
		setTimeout(resolve, ms)
		return promise
	}

	void sleep(delayMs).then(() => { emit({ type: "stream-character" }) })
	return undefined
}

const configureCmd = (player: AuditionPlayer, config: BlipConfig): Cmd<Msg> => () => {
	player.configure(config)
	return undefined
}

const playCmd = (player: AuditionPlayer, tone: Tone): Cmd<Msg> => () => {
	player.play(tone)
	return undefined
}

const choiceLine = <Value extends string>(
	label: string,
	values: readonly Value[],
	active: number,
): string => `${accent(label.padEnd(10))}${values.map((value, index) =>
	match(index === active)
		.with(true, () => selected(value))
		.with(false, () => muted(value))
		.exhaustive(),
).join("  ")}`

const speedSlider = (speedIndex: number): string => {
	const filled = Math.round((speedIndex / STREAM_SPEED_JUMPS) * 12)
	return `${accent("speed".padEnd(10))}${muted("slow 1000 ms")} ${selected(`${"━".repeat(filled)}●${"━".repeat(12 - filled)}`)} ${muted("1 ms fast")}  ${String(streamDelayMs(speedIndex))} ms`
}

const createLabApp = (player: AuditionPlayer, initialConfig: BlipConfig): App<Model, Msg> => ({
	init: () => [
		{
			width: DEFAULT_WIDTH,
			height: DEFAULT_HEIGHT,
			presetIndex: 0,
			materialIndex: MATERIALS.indexOf(initialConfig.voices.text.material),
			config: initialConfig,
			pending: 0,
			streamSpeedIndex: DEFAULT_STREAM_SPEED_INDEX,
			streamOffset: 0,
			streamed: "",
			paused: false,
		},
		[streamCmd(streamDelayMs(DEFAULT_STREAM_SPEED_INDEX))],
	],

	update: (msg, model) =>
		match(msg)
			.when(isKeyMsg, (key): [Model, Cmd<Msg>[]] =>
				match(key)
					.returnType<[Model, Cmd<Msg>[]]>()
					.with({ ctrl: true, key: "c" }, () => [model, [quit<Msg>()]])
					.with({ key: "q" }, () => [model, [quit<Msg>()]])
					.with({ key: "space" }, (): [Model, Cmd<Msg>[]] => {
						const paused = !model.paused
						return [
							{ ...model, paused },
							paused ? [] : [streamCmd(streamDelayMs(model.streamSpeedIndex))],
						]
					})
					.with({ key: "[" }, (): [Model, Cmd<Msg>[]] => [
						{
							...model,
							streamSpeedIndex: clamp(model.streamSpeedIndex - 1, 0, STREAM_SPEED_JUMPS),
						},
						[],
					])
					.with({ key: "]" }, (): [Model, Cmd<Msg>[]] => [
						{
							...model,
							streamSpeedIndex: clamp(model.streamSpeedIndex + 1, 0, STREAM_SPEED_JUMPS),
						},
						[],
					])
					.with({ key: "left" }, (): [Model, Cmd<Msg>[]] => {
						const presetIndex = cycle(model.presetIndex, -1, presetNames.length)
						const preset = presetNames[presetIndex] ?? "default"
						const material = MATERIALS[model.materialIndex] ?? "ceramic"
						const config = configFor(preset, material)
						return [{ ...model, presetIndex, config, pending: 0 }, [configureCmd(player, config)]]
					})
					.with({ key: "right" }, (): [Model, Cmd<Msg>[]] => {
						const presetIndex = cycle(model.presetIndex, 1, presetNames.length)
						const preset = presetNames[presetIndex] ?? "default"
						const material = MATERIALS[model.materialIndex] ?? "ceramic"
						const config = configFor(preset, material)
						return [{ ...model, presetIndex, config, pending: 0 }, [configureCmd(player, config)]]
					})
					.with({ key: "up" }, (): [Model, Cmd<Msg>[]] => {
						const materialIndex = cycle(model.materialIndex, -1, MATERIALS.length)
						const preset = presetNames[model.presetIndex] ?? "default"
						const material = MATERIALS[materialIndex] ?? "ceramic"
						const config = configFor(preset, material)
						return [{ ...model, materialIndex, config, pending: 0 }, [configureCmd(player, config)]]
					})
					.with({ key: "down" }, (): [Model, Cmd<Msg>[]] => {
						const materialIndex = cycle(model.materialIndex, 1, MATERIALS.length)
						const preset = presetNames[model.presetIndex] ?? "default"
						const material = MATERIALS[materialIndex] ?? "ceramic"
						const config = configFor(preset, material)
						return [{ ...model, materialIndex, config, pending: 0 }, [configureCmd(player, config)]]
					})
					.otherwise(() => [model, []]),
			)
			.with({ type: "resize" }, (resize): [Model, Cmd<Msg>[]] => [
				{ ...model, width: resize.columns, height: resize.rows },
				[],
			])
			.with({ type: "stream-character" }, (): [Model, Cmd<Msg>[]] => {
				if (model.paused) return [model, []]

				const char = STREAM_TEXT[model.streamOffset] ?? " "
				const streamed = `${model.streamed}${char}`.slice(-Math.max(1, model.width - 4))
				const pending = model.pending + 1
				const nextOffset = (model.streamOffset + 1) % STREAM_TEXT.length
				const voice = model.config.voices.text
				const continueStreaming = streamCmd(streamDelayMs(model.streamSpeedIndex))
				if (!voice.enabled || pending < voice.charsPerBlip) {
					return [
						{ ...model, streamed, pending, streamOffset: nextOffset },
						[continueStreaming],
					]
				}

				const next = { ...model, streamed, pending: 0, streamOffset: nextOffset }
				const frequency = pitchFromCharacter(char, voice)
				if (frequency === undefined) return [next, [continueStreaming]]
				return [next, [playCmd(player, {
					frequency,
					toneMs: voice.toneMs,
					material: voice.material,
					touch: voice.touch,
					volume: voice.volume,
				}), continueStreaming]]
			})
			.otherwise((): [Model, Cmd<Msg>[]] => [model, []]),

	view: (model) => {
		const preset = presetNames[model.presetIndex] ?? "default"
		const voice = model.config.voices.text
		const status = model.paused ? selected("paused") : accent("streaming")
		const divider = muted("─".repeat(Math.max(1, model.width)))
		const screen = [
			accent("BLIPS SOUND LAB"),
			divider,
			choiceLine("preset", presetNames, model.presetIndex),
			choiceLine("material", MATERIALS, model.materialIndex),
			"",
			`${accent("sound")}  ${voice.touch} touch  ${String(voice.toneMs)} ms  ${voice.baseFrequency.toFixed(2)} Hz  every ${String(voice.charsPerBlip)} chars`,
			`${accent("preset")} ${presets[preset].description}`,
			speedSlider(model.streamSpeedIndex),
			`${accent("stream")} ${status}`,
			model.streamed || muted("waiting for text…"),
			"",
			muted("←/→ preset   ↑/↓ material   [ / ] speed   space pause   q quit"),
		].join("\n")
		return parseAnsiToSurface(screen, model.width, model.height)
	},
})

const initialMaterial: Material = "ceramic"
const initialConfig = configFor("default", initialMaterial)
const player = createAuditionPlayer(initialConfig)

try {
	await startApp(createLabApp(player, initialConfig))
} finally {
	player.dispose()
}
