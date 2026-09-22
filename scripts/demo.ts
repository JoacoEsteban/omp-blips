/**
 * Plays a phrase through the real pitch + player path, at streaming speed.
 * Usage: bun run scripts/demo.ts "some text" [text|thinking|tool] [afplay|ffplay] [wrap|fold]
 */
import { match, P } from "ts-pattern"
import { type Backend, type StreamKind, type VoiceConfig } from "../src/config.ts"
import { pitchFromCharacter } from "../src/pitch.ts"
import { createPlayer } from "../src/player.ts"
import { loadSettings } from "../src/settings.ts"

const sleep = (ms: number): Promise<void> => {
 const { promise, resolve } = Promise.withResolvers<void>()
 setTimeout(resolve, ms)
 return promise
}

const text = process.argv[2] ?? "the quick brown fox jumps over the lazy dog 0123456789"
const kind: StreamKind = match(process.argv[3])
 .with("thinking", () => "thinking" as const)
 .with("tool", () => "tool" as const)
 .otherwise(() => "text" as const)
const { config: loaded, sources, problems } = loadSettings(process.cwd())
const backend: Backend = match(process.argv[4])
 .with("afplay", "ffplay", (name) => name)
 .otherwise(() => loaded.backend)
const mapping = match(process.argv[5])
 .with("wrap", "fold", (name) => name)
 .otherwise(() => undefined)

const config = { ...loaded, backend }
const base = config.voices[kind]
const voice: VoiceConfig = match(mapping)
 .with(P.not(P.nullish), (name) => ({ ...base, mapping: name }))
 .otherwise(() => base)
const player = createPlayer(config)
console.log(`backend: ${backend}, voice: ${kind}, mapping: ${voice.mapping}`)
console.log(`settings: ${sources.length === 0 ? "defaults" : sources.join(", ")}`)
for (const problem of problems) console.log(`problem: ${problem}`)

let pending = 0
for (const char of text) {
 pending += 1
 if (pending < voice.charsPerBlip) continue
 pending = 0

 const frequency = pitchFromCharacter(char, voice)
 if (frequency !== undefined) {
  console.log(`${char} -> ${frequency.toFixed(1)} Hz`)
  player.play({ frequency, toneMs: voice.toneMs, volume: voice.volume })
 }
 await sleep(config.minIntervalMs)
}

await sleep(voice.toneMs * 6)
player.dispose()
