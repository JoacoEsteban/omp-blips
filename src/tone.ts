import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { encodeWav, soundKey, voice, type Sound } from "./synth.ts"

const cacheDir = join(tmpdir(), "omp-blips")
const files = new Map<string, string>()

/** Path of a cached WAV for this sound, rendering it on first use. */
export const toneFile = (sound: Sound): string => {
	const key = `blip-${soundKey(sound)}.wav`
	const cached = files.get(key)
	if (cached !== undefined) return cached

	const path = join(cacheDir, key)
	if (!existsSync(path)) {
		mkdirSync(cacheDir, { recursive: true })
		writeFileSync(path, encodeWav(voice(sound)))
	}
	files.set(key, path)
	return path
}
