import { match } from "ts-pattern"
import type { BlipConfig } from "./config.ts"
import { createAfplayPlayer } from "./players/afplay.ts"
import { createFfplayPlayer } from "./players/ffplay.ts"
import type { Player } from "./players/types.ts"

export type { Player } from "./players/types.ts"

const backend = (config: BlipConfig): Player =>
  match(config.backend)
    .with("ffplay", () => createFfplayPlayer(config))
    .with("afplay", () => createAfplayPlayer(config))
    .exhaustive()

/** Backend plus the rate limit that keeps fast streams from stacking tones. */
export const createPlayer = (config: BlipConfig): Player => {
  const player = backend(config)
  let lastPlayedAt = 0

  const play = (frequency: number): void => {
    const now = performance.now()
    if (now - lastPlayedAt < config.minIntervalMs) return
    lastPlayedAt = now
    player.play(frequency)
  }

  return { play, dispose: player.dispose }
}
