/**
 * Plays a phrase through the real pitch + player path, at streaming speed.
 * Usage: bun run scripts/demo.ts "some text"
 */
import { defaultConfig } from "../src/config.ts"
import { pitchFromCharacter } from "../src/pitch.ts"
import { createPlayer } from "../src/player.ts"

const sleep = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

const text = process.argv[2] ?? "the quick brown fox jumps over the lazy dog 0123456789"
const player = createPlayer(defaultConfig)

let charsSinceBlip = 0
for (const char of text) {
  charsSinceBlip += 1
  if (charsSinceBlip < defaultConfig.charsPerBlip) continue
  charsSinceBlip = 0

  const frequency = pitchFromCharacter(char, defaultConfig)
  if (frequency !== undefined) {
    console.log(`${char} -> ${frequency.toFixed(1)} Hz`)
    player.play(frequency)
  }
  await sleep(defaultConfig.minIntervalMs)
}

await sleep(defaultConfig.toneMs * 4)
player.dispose()
