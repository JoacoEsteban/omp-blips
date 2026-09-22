/**
 * Plays a phrase through the real pitch + player path, at streaming speed.
 * Usage: bun run scripts/demo.ts "text" [text|thinking|tool] [afplay|ffplay] [wrap|fold] [preset]
 */
import { match, P } from "ts-pattern"
import type { Backend, StreamKind } from "../src/config.ts"
import { createPlayer } from "../src/player.ts"
import { presetNames } from "../src/presets.ts"
import { loadSettings } from "../src/settings.ts"
import { playText } from "./play.ts"

const text = process.argv[2] ?? "the quick brown fox jumps over the lazy dog 0123456789"
const kind: StreamKind = match(process.argv[3])
 .with("thinking", "tool", (name) => name)
 .otherwise(() => "text" as const)
const preset = presetNames.find((name) => name === process.argv[6])

const { config: loaded, preset: used, sources, problems } = loadSettings(process.cwd(), preset)
const backend: Backend = match(process.argv[4])
 .with("afplay", "ffplay", (name) => name)
 .otherwise(() => loaded.backend)
const mapping = match(process.argv[5])
 .with("wrap", "fold", (name) => name)
 .otherwise(() => undefined)

const voice = match(mapping)
 .with(P.not(P.nullish), (name) => ({ ...loaded.voices[kind], mapping: name }))
 .otherwise(() => loaded.voices[kind])
const config = { ...loaded, backend, voices: { ...loaded.voices, [kind]: voice } }
const player = createPlayer(config)

console.log(`preset: ${used}, backend: ${backend}, voice: ${kind}, mapping: ${voice.mapping}`)
console.log(`settings: ${sources.length === 0 ? "defaults" : sources.join(", ")}`)
for (const problem of problems) console.log(`problem: ${problem}`)

await playText(player, config, kind, text, (char, frequency) =>
 console.log(`${char} -> ${frequency.toFixed(1)} Hz`),
)
player.dispose()
