import { spawn, type ChildProcess } from "node:child_process"
import type { BlipConfig } from "./config.ts"
import { toneFile } from "./tone.ts"

export interface Player {
  /** Play a tone unless the rate limit swallows it. Never throws. */
  readonly play: (frequency: number) => void
  /** Kill anything still sounding. */
  readonly dispose: () => void
}

/** Above this, audio is lagging behind the stream; drop instead of queueing. */
const MAX_CONCURRENT = 6

/**
 * macOS `afplay`, one short-lived process per blip. No native audio bindings,
 * no long-lived sink; the cost is a ~50 ms attack latency, which is fine for
 * ambient feedback.
 */
export const createPlayer = (config: BlipConfig): Player => {
  const live = new Set<ChildProcess>()
  let lastPlayedAt = 0

  const play = (frequency: number): void => {
    const now = performance.now()
    if (now - lastPlayedAt < config.minIntervalMs) return
    if (live.size >= MAX_CONCURRENT) return
    lastPlayedAt = now

    const child = spawn("afplay", ["-v", config.volume.toFixed(3), toneFile(frequency, config.toneMs)], {
      stdio: "ignore",
    })
    live.add(child)
    child.on("error", () => live.delete(child))
    child.on("exit", () => live.delete(child))
    child.unref()
  }

  const dispose = (): void => {
    for (const child of live) child.kill("SIGKILL")
    live.clear()
  }

  return { play, dispose }
}
