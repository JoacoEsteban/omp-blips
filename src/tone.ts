import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeWav, soundKey, voice, type Sound } from './synth.ts'

const CACHE_DIR = join(tmpdir(), 'omp-blips')
const FILES = new Map<string, string>()

/** Path of a cached WAV for this sound, rendering it on first use. */
export const toneFile = (sound: Sound): string => {
  const key = `blip-${soundKey(sound)}.wav`
  const cached = FILES.get(key)
  if (cached !== undefined) return cached

  const path = join(CACHE_DIR, key)
  if (!existsSync(path)) {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(path, encodeWav(voice(sound)))
  }
  FILES.set(key, path)
  return path
}
