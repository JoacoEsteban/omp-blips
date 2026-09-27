/**
 * Plays the same phrase through every preset, in order, so you can pick one.
 * Usage: bun run scripts/audition.ts "some text" [text|thinking|tool]
 */
import {
  concat,
  concatMap,
  defer,
  from,
  ignoreElements,
  lastValueFrom,
  timer
} from 'rxjs'
import { match } from 'ts-pattern'
import type { StreamKind } from '../src/config.ts'
import { PRESET_NAMES, presets } from '../src/presets.ts'
import { loadSettings } from '../src/settings.ts'
import { playText } from './play.ts'

/** Silence between two presets, so they do not run together. */
const GAP_MS = 700

const text = process.argv[2] ?? 'the quick brown fox jumps over the lazy dog'
const kind: StreamKind = match(process.argv[3])
  .with('thinking', 'tool', (name) => name)
  .otherwise(() => 'text' as const)

await lastValueFrom(
  from(PRESET_NAMES).pipe(
    concatMap((name) =>
      defer(() => {
        const { config } = loadSettings(name)
        const voice = config.voices[kind]

        console.log(
          `\n${name} — ${presets[name].description} (${kind}: ${voice.material}, ${voice.touch})`
        )

        return concat(
          playText(config, kind, text),
          timer(GAP_MS).pipe(ignoreElements())
        )
      })
    )
  ),
  { defaultValue: undefined }
)
