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

 const play = (tone: Tone): void => {
  if (live.size >= MAX_CONCURRENT) return

  const child = spawn("afplay", ["-v", tone.volume.toFixed(3), toneFile(tone)], {
   stdio: "ignore",
  })
  live.add(child)
  child.on("error", () => live.delete(child))
  child.on("exit", () => live.delete(child))
  child.unref()
 }

 /** Nothing to fade: an `afplay` process is either running or killed. */
 const silence = (): void => {
  for (const child of live) child.kill("SIGKILL")
  live.clear()
 }

 return { play, flush: silence, dispose: silence }
}
