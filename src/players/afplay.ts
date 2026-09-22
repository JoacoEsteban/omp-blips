import { spawn, type ChildProcess } from "node:child_process"
import { toneFile } from "../tone.ts"
import type { Player, Tone } from "./types.ts"

/** Above this, audio is lagging behind the stream; drop instead of queueing. */
const MAX_CONCURRENT = 6

/**
 * One short-lived `afplay` per blip against a cached WAV. No dependencies
 * beyond macOS itself; the cost is a process spawn (~50 ms) before each tone
 * is audible, and overlapping tones are racing processes rather than a mix.
 */
export const createAfplayPlayer = (): Player => {
  const live = new Set<ChildProcess>()

  const play = ({ frequency, toneMs, volume }: Tone): void => {
    if (live.size >= MAX_CONCURRENT) return

    const child = spawn("afplay", ["-v", volume.toFixed(3), toneFile(frequency, toneMs)], {
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
