import { parseAnsiToSurface } from "@flyingrobots/bijou"
import { chalkStyle, startApp } from "@flyingrobots/bijou-node"
import { isKeyMsg, quit, type App, type Cmd } from "@flyingrobots/bijou-tui"
import { generate, render } from "esfuzz"
import { loremIpsum } from "lorem-ipsum"
import { match } from "ts-pattern"
import type { BlipConfig } from "../src/config.ts"
import { pitchFromCharacter } from "../src/pitch.ts"
import type { Player, Tone } from "../src/player.ts"
import { createFfplayPlayer } from "../src/players/ffplay.ts"
import { type PresetName, presetNames, presets } from "../src/presets.ts"
import { loadSettings } from "../src/settings.ts"
import type { Material } from "../src/synth.ts"

const DEFAULT_STREAM_DELAY_MS = 10
const MIN_STREAM_DELAY_MS = 1
const MAX_STREAM_DELAY_MS = 1_000
const STREAM_SPEED_JUMPS = 50
const DEFAULT_WIDTH = 100
const DEFAULT_HEIGHT = 24
const CALL_GENERATION_ATTEMPTS = 8
const MATERIALS: readonly Material[] = ["wood", "stone", "ceramic", "glass"]

const style = chalkStyle()
const accent = (text: string): string => style.bold(style.hex("#22d3ee", text))
const selected = (text: string): string => style.bold(style.hex("#fbbf24", `[${text}]`))
const muted = (text: string): string => style.hex("#64748b", text)

type StreamMode = "prose" | "call"

interface Model {
	readonly width: number
	readonly height: number
	readonly presetIndex: number
	readonly materialIndex: number
	readonly config: BlipConfig
	readonly mode: StreamMode
	readonly proseSample: string
	readonly callSample: string
	readonly callError: string
	readonly pending: number
	readonly streamSpeedIndex: number
	readonly streamOffset: number
	readonly streamed: string
	readonly paused: boolean
	readonly streamScheduled: boolean
}

type Msg = { readonly type: "stream-character" }

interface AuditionPlayer {
	readonly configure: (config: BlipConfig) => void
	readonly play: (tone: Tone) => void
	readonly dispose: () => void
}

interface GeneratedCall {
	readonly sample: string
	readonly error: string
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
			tool: { ...config.voices.tool, material },
		},
	}
}

const generateProseSample = (): string =>
	loremIpsum({ count: 3, units: "paragraphs" })

const generateCallSample = (previous: string): GeneratedCall => {
	for (let attempt = 0; attempt < CALL_GENERATION_ATTEMPTS; attempt += 1) {
		const sample = render(generate({ maxDepth: 8 }))
		if (sample.trim().length > 0) return { sample, error: "" }
	}
	return {
		sample: previous,
		error: `Unable to generate a non-empty JavaScript sample after ${String(CALL_GENERATION_ATTEMPTS)} attempts.`,
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

const sampleFor = (model: Model): string =>
	match(model.mode)
		.with("prose", () => model.proseSample)
		.with("call", () => model.callSample)
		.exhaustive()

const voiceFor = (model: Model): BlipConfig["voices"]["text"] =>
	match(model.mode)
		.with("prose", () => model.config.voices.text)
		.with("call", () => model.config.voices.tool)
		.exhaustive()

const wrapPreview = (text: string, width: number): string[] => {
	const lineWidth = Math.max(1, width)
	const lines: string[] = []
	for (const line of text.split("\n")) {
		if (line.length === 0) {
			lines.push("")
			continue
		}
		let remaining = line
		while (remaining.length > lineWidth) {
			lines.push(remaining.slice(0, lineWidth))
			remaining = remaining.slice(lineWidth)
		}
		lines.push(remaining)
	}
	return lines
}

const scheduleIfNeeded = (model: Model): [Model, Cmd<Msg>[]] => {
	if (
		model.paused ||
		model.streamScheduled ||
		sampleFor(model).length === 0 ||
		(model.mode === "call" && model.callError.length > 0)
	) {
		return [model, []]
	}
	return [
		{ ...model, streamScheduled: true },
		[streamCmd(streamDelayMs(model.streamSpeedIndex))],
	]
}
const modeIndex = (mode: StreamMode): number =>
	match(mode)
		.with("prose", () => 0)
		.with("call", () => 1)
		.exhaustive()

const previewFor = (model: Model): string[] => {
	if (model.streamed.length > 0) return wrapPreview(model.streamed, model.width)
	return [muted("waiting for text…")]
}


const createLabApp = (player: AuditionPlayer, initialConfig: BlipConfig): App<Model, Msg> => ({
	init: () => {
		const call = generateCallSample("")
		return [
			{
				width: DEFAULT_WIDTH,
				height: DEFAULT_HEIGHT,
				presetIndex: 0,
				materialIndex: MATERIALS.indexOf(initialConfig.voices.text.material),
				config: initialConfig,
				mode: "prose",
				proseSample: generateProseSample(),
				callSample: call.sample,
				callError: call.error,
				pending: 0,
				streamSpeedIndex: DEFAULT_STREAM_SPEED_INDEX,
				streamOffset: 0,
				streamed: "",
				paused: false,
				streamScheduled: true,
			},
			[streamCmd(streamDelayMs(DEFAULT_STREAM_SPEED_INDEX))],
		]
	},

	update: (msg, model) =>
		match(msg)
			.when(isKeyMsg, (key): [Model, Cmd<Msg>[]] =>
				match(key)
					.returnType<[Model, Cmd<Msg>[]]>()
					.with({ ctrl: true, key: "c" }, () => [model, [quit<Msg>()]])
					.with({ key: "q" }, () => [model, [quit<Msg>()]])
					.with({ key: "space" }, (): [Model, Cmd<Msg>[]] =>
						scheduleIfNeeded({ ...model, paused: !model.paused }),
					)
					.with({ key: "tab" }, (): [Model, Cmd<Msg>[]] => {
						const mode = match(model.mode)
							.with("prose", () => "call" as const)
							.with("call", () => "prose" as const)
							.exhaustive()
						return scheduleIfNeeded({
							...model,
							mode,
							pending: 0,
							streamOffset: 0,
							streamed: "",
						})
					})
					.with({ key: "r" }, (): [Model, Cmd<Msg>[]] => {
						if (model.mode === "prose") {
							return scheduleIfNeeded({
								...model,
								proseSample: generateProseSample(),
								pending: 0,
								streamOffset: 0,
								streamed: "",
							})
						}
						const call = generateCallSample(model.callSample)
						return scheduleIfNeeded({
							...model,
							callSample: call.sample,
							callError: call.error,
							pending: 0,
							streamOffset: 0,
							streamed: "",
						})
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
						const [next, commands] = scheduleIfNeeded({
							...model,
							presetIndex,
							config,
							pending: 0,
						})
						return [next, [configureCmd(player, config), ...commands]]
					})
					.with({ key: "right" }, (): [Model, Cmd<Msg>[]] => {
						const presetIndex = cycle(model.presetIndex, 1, presetNames.length)
						const preset = presetNames[presetIndex] ?? "default"
						const material = MATERIALS[model.materialIndex] ?? "ceramic"
						const config = configFor(preset, material)
						const [next, commands] = scheduleIfNeeded({
							...model,
							presetIndex,
							config,
							pending: 0,
						})
						return [next, [configureCmd(player, config), ...commands]]
					})
					.with({ key: "up" }, (): [Model, Cmd<Msg>[]] => {
						const materialIndex = cycle(model.materialIndex, -1, MATERIALS.length)
						const preset = presetNames[model.presetIndex] ?? "default"
						const material = MATERIALS[materialIndex] ?? "ceramic"
						const config = configFor(preset, material)
						const [next, commands] = scheduleIfNeeded({
							...model,
							materialIndex,
							config,
							pending: 0,
						})
						return [next, [configureCmd(player, config), ...commands]]
					})
					.with({ key: "down" }, (): [Model, Cmd<Msg>[]] => {
						const materialIndex = cycle(model.materialIndex, 1, MATERIALS.length)
						const preset = presetNames[model.presetIndex] ?? "default"
						const material = MATERIALS[materialIndex] ?? "ceramic"
						const config = configFor(preset, material)
						const [next, commands] = scheduleIfNeeded({
							...model,
							materialIndex,
							config,
							pending: 0,
						})
						return [next, [configureCmd(player, config), ...commands]]
					})
					.otherwise(() => [model, []]),
			)
			.with({ type: "resize" }, (resize): [Model, Cmd<Msg>[]] => [
				{ ...model, width: resize.columns, height: resize.rows },
				[],
			])
			.with({ type: "stream-character" }, (): [Model, Cmd<Msg>[]] => {
				const ready = { ...model, streamScheduled: false }
				if (ready.paused || (ready.mode === "call" && ready.callError.length > 0)) {
					return [ready, []]
				}
				const sample = sampleFor(ready)
				if (sample.length === 0) return [ready, []]

				const char = sample[ready.streamOffset] ?? ""
				const previewLimit = Math.max(1, ready.width * ready.height * 2)
				const pending = ready.pending + 1
				const baseNext = {
					...ready,
					streamed: `${ready.streamed}${char}`.slice(-previewLimit),
					pending,
					streamOffset: ready.streamOffset + 1,
				}
				const reachedEnd = baseNext.streamOffset >= sample.length
				const next = match(reachedEnd)
					.with(false, () => baseNext)
					.with(true, () =>
						match(ready.mode)
							.with("prose", () => ({
								...baseNext,
								proseSample: generateProseSample(),
								streamOffset: 0,
								streamed: `${baseNext.streamed}\n`.slice(-previewLimit),
							}))
							.with("call", () => {
								const call = generateCallSample(ready.callSample)
								if (call.error.length > 0) {
									return { ...baseNext, callError: call.error }
								}
								return {
									...baseNext,
									callSample: call.sample,
									callError: "",
									streamOffset: 0,
									streamed: `${baseNext.streamed}\n`.slice(-previewLimit),
								}
							})
							.exhaustive(),
					)
					.exhaustive()
				const voice = voiceFor(ready)
				if (!voice.enabled || pending < voice.charsPerBlip) {
					return scheduleIfNeeded(next)
				}

				const withPending = { ...next, pending: 0 }
				const frequency = pitchFromCharacter(char, voice)
				if (frequency === undefined) return scheduleIfNeeded(withPending)
				const play = playCmd(player, {
					frequency,
					toneMs: voice.toneMs,
					material: voice.material,
					touch: voice.touch,
					volume: voice.volume,
				})
				const [scheduled, commands] = scheduleIfNeeded(withPending)
				return [scheduled, [play, ...commands]]
			})
			.otherwise((): [Model, Cmd<Msg>[]] => [model, []]),

	view: (model) => {
		const preset = presetNames[model.presetIndex] ?? "default"
		const voice = voiceFor(model)
		const status = match(model.paused)
			.with(true, () => selected("paused"))
			.with(false, () => accent("streaming"))
			.exhaustive()
		const divider = muted("─".repeat(Math.max(1, model.width)))
		const header = [
			accent("BLIPS SOUND LAB"),
			divider,
			choiceLine("mode", ["prose", "call"] as const, modeIndex(model.mode)),
			choiceLine("preset", presetNames, model.presetIndex),
			choiceLine("material", MATERIALS, model.materialIndex),
			"",
			`${accent("sound")}  ${voice.touch} touch  ${String(voice.toneMs)} ms  ${voice.baseFrequency.toFixed(2)} Hz  every ${String(voice.charsPerBlip)} chars`,
			`${accent("preset")} ${presets[preset].description}`,
			speedSlider(model.streamSpeedIndex),
			`${accent("stream")} ${model.mode} ${status}`,
		]
		if (model.callError.length > 0) header.push(muted(`call error: ${model.callError}`))
		const preview = previewFor(model)

		const footerText = "tab mode   r regenerate   ←/→ preset   ↑/↓ material   [ / ] speed   space pause   q quit"
		const footer = wrapPreview(footerText, model.width).map((line) => muted(line))
		const availablePreviewHeight = Math.max(1, model.height - header.length - footer.length)
		const visiblePreview = preview.slice(-availablePreviewHeight)
		const screen = [...header, ...visiblePreview, ...footer].join("\n")
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
