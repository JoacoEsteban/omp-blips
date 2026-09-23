/**
 * Plays the same phrase through every preset, in order, so you can pick one.
 * Usage: bun run scripts/audition.ts "some text" [text|thinking|tool]
 */
import { match } from 'ts-pattern'
import type { StreamKind } from '../src/config.ts'
import { createPlayer } from '../src/player.ts'
import { presetNames, presets } from '../src/presets.ts'
import { loadSettings } from '../src/settings.ts'
import { playText, sleep } from './play.ts'

const text = process.argv[2] ?? 'the quick brown fox jumps over the lazy dog'
const kind: StreamKind = match(process.argv[3])
  .with('thinking', 'tool', (name) => name)
  .otherwise(() => 'text' as const)

for (const name of presetNames) {
  const { config } = loadSettings(process.cwd(), name)
  const player = createPlayer(config)
  const voice = config.voices[kind]

  console.log(
    `\n${name} — ${presets[name].description} (${kind}: ${voice.material}, ${voice.touch})`
  )
  await playText(player, config, kind, text)

  player.dispose()
  await sleep(700)
}
