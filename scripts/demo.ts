/**
 * Plays a phrase through the real pitch + player path, at streaming speed.
 * Usage: bun run scripts/demo.ts "text" [text|thinking|tool] [afplay|ffplay] [wrap|fold] [preset] [material] [touch]
 */
import { match } from "ts-pattern"
import type { Backend, StreamKind } from "../src/config.ts"
import { createPlayer } from "../src/player.ts"
import { presetNames } from "../src/presets.ts"
import { loadSettings } from "../src/settings.ts"
import type { Material, Touch } from "../src/synth.ts"
import { playText } from "./play.ts"

const text = process.argv[2] ?? "the quick brown fox jumps over the lazy dog 0123456789"
const kind: StreamKind = match(process.argv[3])
	.with("thinking", "tool", (name) => name)
	.otherwise(() => "text" as const)
const preset = presetNames.find((name) => name === process.argv[6])
const material: Material | undefined = match(process.argv[7])
	.with("wood", "ceramic", "glass", (name) => name)
	.otherwise(() => undefined)
const touch: Touch | undefined = match(process.argv[8])
	.with("soft", "normal", "firm", (name) => name)
	.otherwise(() => undefined)

const { config: loaded, preset: used, sources, problems } = loadSettings(process.cwd(), preset)
const backend: Backend = match(process.argv[4])
	.with("afplay", "ffplay", (name) => name)
	.otherwise(() => loaded.backend)
const mapping = match(process.argv[5])
	.with("wrap", "fold", (name) => name)
	.otherwise(() => undefined)

const voice = {
	...loaded.voices[kind],
	mapping: mapping ?? loaded.voices[kind].mapping,
	material: material ?? loaded.voices[kind].material,
	touch: touch ?? loaded.voices[kind].touch,
}
const config = { ...loaded, backend, voices: { ...loaded.voices, [kind]: voice } }
const player = createPlayer(config)

console.log(
	`preset: ${used}, backend: ${backend}, voice: ${kind}, mapping: ${voice.mapping}, material: ${voice.material}, touch: ${voice.touch}`,
)
const sourceLabel = sources.join(", ") || "defaults"
console.log(`settings: ${sourceLabel}`)
for (const problem of problems) console.log(`problem: ${problem}`)

await playText(player, config, kind, text, (char, frequency) =>
	console.log(`${char} -> ${frequency.toFixed(1)} Hz`),
)
player.dispose()
