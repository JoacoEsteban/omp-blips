import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { match, P } from 'ts-pattern'
import { z } from 'zod'
import {
  type BlipConfig,
  type ConfigPatch,
  defaultConfig,
  type VoiceConfig,
  type VoicePatch
} from './config.ts'
import { type PresetName, PRESET_NAMES, presets } from './presets.ts'

const readingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('alphabet') }),
  z.strictObject({
    kind: z.literal('codepoint'),
    span: z.number().int().positive()
  }),
  z.strictObject({ kind: z.literal('class') }),
  z.strictObject({ kind: z.literal('vowels') }),
  z.strictObject({
    kind: z.literal('phrase'),
    span: z.number().int().positive()
  })
])

const pitchSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('scalar'),
    scale: z.array(z.number()).nonempty(),
    octaves: z.number().int().positive(),
    mapping: z.enum(['wrap', 'fold'])
  }),
  z.strictObject({ kind: z.literal('drone') }),
  z.strictObject({
    kind: z.literal('chromatic'),
    span: z.number().int().positive()
  })
])

const voiceSchema = z
  .object({
    enabled: z.boolean(),
    charsPerBlip: z.number().int().positive(),
    toneMs: z.number().positive(),
    decay: z.number().positive(),
    volume: z.number().min(0).max(1),
    material: z.enum(['wood', 'stone', 'ceramic', 'glass']),
    touch: z.enum(['soft', 'normal', 'firm']),
    baseFrequency: z.number().positive(),
    reading: readingSchema,
    pitch: pitchSchema
  })
  .partial()
  .strict()

const settingsSchema = z
  .object({
    preset: z.enum(PRESET_NAMES),
    minIntervalMs: z.number().min(0),
    backend: z.enum(['afplay', 'ffplay']),
    voices: z
      .object({ text: voiceSchema, thinking: voiceSchema, tool: voiceSchema })
      .partial()
      .strict()
  })
  .partial()
  .strict()

export type BlipSettings = z.infer<typeof settingsSchema>

/** Where a config file may live. Later entries win. */
export const settingsPaths = (cwd: string): readonly string[] => [
  join(
    process.env['PI_CODING_AGENT_DIR'] ?? join(homedir(), '.omp', 'agent'),
    'blips.json'
  ),
  join(cwd, '.omp', 'blips.json')
]

export interface LoadedSettings {
  readonly config: BlipConfig
  /** The preset the config was built on. */
  readonly preset: PresetName
  /** Files that were read, in precedence order. */
  readonly sources: readonly string[]
  /** Human-readable reasons a file was ignored; never thrown. */
  readonly problems: readonly string[]
}

const readSettings = (path: string): BlipSettings | string =>
  match(
    ((): unknown | Error => {
      try {
        return JSON.parse(readFileSync(path, 'utf8'))
      } catch (error) {
        return match(error)
          .with(P.instanceOf(Error), (cause) => cause)
          .otherwise((cause) => new Error(String(cause)))
      }
    })()
  )
    .with(P.instanceOf(Error), (error) => `${path}: ${error.message}`)
    .otherwise((raw) =>
      match(settingsSchema.safeParse(raw))
        .with({ success: true, data: P.select() }, (data) => data)
        .otherwise((result) => `${path}: ${z.prettifyError(result.error)}`)
    )

/** Field-by-field so `exactOptionalPropertyTypes` never leaks an `undefined` into a voice. */
const mergeVoice = (
  base: VoiceConfig,
  patch: VoicePatch = {}
): VoiceConfig => ({
  enabled: patch.enabled ?? base.enabled,
  charsPerBlip: patch.charsPerBlip ?? base.charsPerBlip,
  toneMs: patch.toneMs ?? base.toneMs,
  decay: patch.decay ?? base.decay,
  volume: patch.volume ?? base.volume,
  material: patch.material ?? base.material,
  touch: patch.touch ?? base.touch,
  baseFrequency: patch.baseFrequency ?? base.baseFrequency,
  reading: patch.reading ?? base.reading,
  pitch: patch.pitch ?? base.pitch
})

/** Lay a patch over a full config. Presets and config files take the same path. */
export const applyPatch = (
  base: BlipConfig,
  patch: ConfigPatch
): BlipConfig => ({
  minIntervalMs: patch.minIntervalMs ?? base.minIntervalMs,
  backend: patch.backend ?? base.backend,
  voices: {
    text: mergeVoice(base.voices.text, patch.voices?.text),
    thinking: mergeVoice(base.voices.thinking, patch.voices?.thinking),
    tool: mergeVoice(base.voices.tool, patch.voices?.tool)
  }
})

/**
 * Defaults, then a preset, then `blips.json` from the agent directory, then the
 * project. A malformed or unknown-keyed file is reported and skipped rather than
 * silently half-applied, so a typo never leaves you guessing at the sound.
 *
 * `preset` overrides the name the files ask for; that is how `/blips preset` works.
 */
export const loadSettings = (
  cwd: string,
  preset?: PresetName
): LoadedSettings => {
  const read = settingsPaths(cwd)
    .filter((path) => existsSync(path))
    .map((path) => ({ path, result: readSettings(path) }))

  const { sources, problems, patches } = read.reduce<{
    readonly sources: readonly string[]
    readonly problems: readonly string[]
    readonly patches: readonly BlipSettings[]
  }>(
    (collected, { path, result }) =>
      match(result)
        .with(P.string, (problem) => ({
          ...collected,
          problems: [...collected.problems, problem]
        }))
        .otherwise((patch) => ({
          ...collected,
          sources: [...collected.sources, path],
          patches: [...collected.patches, patch]
        })),
    { sources: [], problems: [], patches: [] }
  )

  const name =
    preset ??
    patches.reduce<PresetName>((acc, patch) => patch.preset ?? acc, 'default')

  const config = patches.reduce<BlipConfig>(
    applyPatch,
    applyPatch(defaultConfig, presets[name].patch)
  )

  return { config, preset: name, sources, problems }
}
