/**
 * Plays a phrase through the real pitch + player path, at streaming speed.
 * Usage: bun run scripts/demo.ts "some text" [afplay|ffplay]
 */
import { match } from "ts-pattern"
import { type Backend, defaultConfig } from "../src/config.ts"
import { pitchFromCharacter } from "../src/pitch.ts"
import { createPlayer } from "../src/player.ts"

const sleep = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

const text = process.argv[2] ?? "the quick brown fox jumps over the lazy dog 0123456789"
const backend: Backend = match(process.argv[3])
  .with("afplay", () => "afplay" as const)
  .with("ffplay", () => "ffplay" as const)
  .otherwise(() => defaultConfig.backend)

const config = { ...defaultConfig, backend }
const player = createPlayer(config)
console.log(`backend: ${backend}`)

let charsSinceBlip = 0
for (const char of text) {
  charsSinceBlip += 1
  if (charsSinceBlip < config.charsPerBlip) continue
  charsSinceBlip = 0

  const frequency = pitchFromCharacter(char, config)
  if (frequency !== undefined) {
    console.log(`${char} -> ${frequency.toFixed(1)} Hz`)
    player.play(frequency)
  }
  await sleep(config.minIntervalMs)
}

await sleep(config.toneMs * 6)
player.dispose()
