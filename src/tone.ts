import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { encodeWav, voice } from "./synth.ts"

const cacheDir = join(tmpdir(), "omp-blips")
const files = new Map<string, string>()

/** Path of a cached WAV for this tone, rendering it on first use. */
export const toneFile = (frequency: number, toneMs: number): string => {
  const key = `blip-${Math.round(frequency)}-${Math.round(toneMs)}.wav`
  const cached = files.get(key)
  if (cached !== undefined) return cached

  const path = join(cacheDir, key)
  if (!existsSync(path)) {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(path, encodeWav(voice(frequency, toneMs)))
  }
  files.set(key, path)
  return path
}
