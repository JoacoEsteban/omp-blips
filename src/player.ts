import { match } from "ts-pattern"
import type { BlipConfig } from "./config.ts"
import { createAfplayPlayer } from "./players/afplay.ts"
import { createFfplayPlayer } from "./players/ffplay.ts"
import type { Player } from "./players/types.ts"

export type { Player, Tone } from "./players/types.ts"

const backend = (config: BlipConfig): Player =>
  match(config.backend)
    .with("ffplay", () => createFfplayPlayer())
    .with("afplay", () => createAfplayPlayer())
    .exhaustive()

/** Backend plus the rate limit that keeps fast streams from stacking tones. */
export const createPlayer = (config: BlipConfig): Player => {
  const player = backend(config)
  let lastPlayedAt = 0

  const play: Player["play"] = (tone) => {
    const now = performance.now()
    if (now - lastPlayedAt < config.minIntervalMs) return
    lastPlayedAt = now
    player.play(tone)
  }

  return { play, dispose: player.dispose }
}
