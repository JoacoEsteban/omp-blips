import type { ExtensionAPI, MessageUpdateEvent } from "@oh-my-pi/pi-coding-agent"
import { match, P } from "ts-pattern"
import { defaultConfig, type BlipConfig, type StreamKind } from "./config.ts"
import { pitchFromCharacter } from "./pitch.ts"
import { createPlayer, type Player } from "./player.ts"
import { type PresetName, presetNames, presets } from "./presets.ts"
import { loadSettings, settingsPaths } from "./settings.ts"

interface Chunk {
	readonly kind: StreamKind
	readonly delta: string
}

const KINDS = ["text", "thinking", "tool"] as const

/** Prose, reasoning, and tool arguments all stream as deltas; each gets its own voice. */
const chunkOf = (event: MessageUpdateEvent["assistantMessageEvent"]): Chunk | undefined =>
	match(event)
		.with({ type: "text_delta", delta: P.select(P.string) }, (delta) => ({
			kind: "text" as const,
			delta,
		}))
		.with({ type: "thinking_delta", delta: P.select(P.string) }, (delta) => ({
			kind: "thinking" as const,
			delta,
		}))
		.with({ type: "toolcall_delta", delta: P.select(P.string) }, (delta) => ({
			kind: "tool" as const,
			delta,
		}))
		.otherwise(() => undefined)

export default function blips(pi: ExtensionAPI): void {
	let config: BlipConfig = defaultConfig
	let player: Player = createPlayer(config)
	const enabled: Record<StreamKind, boolean> = { text: true, thinking: true, tool: true }
	const pending: Record<StreamKind, number> = { text: 0, thinking: 0, tool: 0 }

	let chosen: PresetName | undefined

	/** Re-read `blips.json`, rebuild the player, and report what happened. */
	const reload = (cwd: string): string => {
		const { config: loaded, preset, sources, problems } = loadSettings(cwd, chosen)
		player.dispose()
		config = loaded
		player = createPlayer(config)
		for (const kind of KINDS) enabled[kind] = config.voices[kind].enabled

		const from = sources.length === 0 ? "defaults" : sources.join(", ")
		return [`preset ${preset}, ${config.backend}, ${from}`, ...problems].join(" | ")
	}

	/** `/blips preset <name>` holds until the session ends; a bad name lists the options. */
	const usePreset = (cwd: string, name: string): string =>
		match(presetNames.find((candidate) => candidate === name))
			.with(P.nullish, () =>
				presetNames.map((key) => `${key} — ${presets[key].description}`).join("\n"),
			)
			.otherwise((valid) => {
				chosen = valid
				return reload(cwd)
			})

	pi.on("session_start", async (_event, ctx) => {
		const summary = reload(ctx.cwd)
		if (summary.includes("|")) ctx.ui.notify(`Blips: ${summary}`, "warning")
	})

	pi.on("message_update", async (event) => {
		const chunk = chunkOf(event.assistantMessageEvent)
		if (chunk === undefined || !enabled[chunk.kind]) return

		const voice = config.voices[chunk.kind]
		for (const char of chunk.delta) {
			pending[chunk.kind] += 1
			if (pending[chunk.kind] < voice.charsPerBlip) continue
			pending[chunk.kind] = 0

			const frequency = pitchFromCharacter(char, voice)
			if (frequency !== undefined) {
				player.play({ frequency, toneMs: voice.toneMs, volume: voice.volume })
			}
		}
	})

	pi.on("message_end", async () => {
		for (const kind of KINDS) pending[kind] = 0
	})

	pi.on("session_shutdown", async () => {
		player.dispose()
	})

	pi.registerCommand("blips", {
		description: "Blips: /blips [on|off|text|thinking|tool|preset <name>|presets|reload|where]",
		handler: async (args, ctx) => {
			const status = (): string =>
				KINDS.map((kind) => `${kind} ${enabled[kind] ? "on" : "off"}`).join(", ")

			const message = match(args.trim().toLowerCase())
				.with("on", "off", (arg) => {
					const on = arg === "on"
					for (const kind of KINDS) enabled[kind] = on
					if (!on) player.dispose()
					return status()
				})
				.with("text", "thinking", "tool", (kind) => {
					enabled[kind] = !enabled[kind]
					return status()
				})
				.with("reload", () => reload(ctx.cwd))
				.with("presets", () =>
					presetNames.map((key) => `${key} — ${presets[key].description}`).join("\n"),
				)
				.with(P.string.startsWith("preset"), (arg) =>
					usePreset(ctx.cwd, arg.slice("preset".length).trim()),
				)
				.with("where", () => settingsPaths(ctx.cwd).join(", "))
				.otherwise(() => {
					const silent = !enabled.text && !enabled.thinking && !enabled.tool
					for (const kind of KINDS) enabled[kind] = silent
					if (!silent) player.dispose()
					return status()
				})

			ctx.ui.notify(`Blips: ${message}`, "info")
		},
	})
}
