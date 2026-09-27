import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { match, P } from 'ts-pattern'
import { z } from 'zod'
import {
  type BlipConfig,
  type ConfigPatch,
  defaultConfig,
  type StreamKind,
  STREAM_KINDS,
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

const colorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixed'), at: z.number().min(0).max(1) }),
  z.strictObject({
    kind: z.literal('vowel'),
    span: z.number().int().positive()
  })
])
const panSchema = z.number().finite().min(-1).max(1)

const motionSchema = z.strictObject({
  kind: z.literal('oscillate'),
  clock: z.enum(['tone', 'voice']),
  depth: z.number().finite().min(0).max(1),
  periodMs: z.number().finite().positive()
})

const placementSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixed'), at: panSchema }),
  z.strictObject({
    kind: z.literal('characters'),
    groups: z.array(z.strictObject({ chars: z.string(), at: panSchema })),
    otherwise: panSchema
  }),
  z.strictObject({
    kind: z.literal('alternate'),
    positions: z.array(panSchema).nonempty()
  })
])

const spatialSchema = z.strictObject({
  placement: placementSchema,
  motion: motionSchema.optional()
})

const voiceSchema = z
  .object({
    enabled: z.boolean(),
    divisor: z.number().int().positive(),
    stride: z.number().int().positive(),
    catchup: z.number().int().positive(),
    toneMs: z.number().positive(),
    decay: z.number().positive(),
    swell: z.number().min(0).max(1),
    hold: z.number().min(0).max(1),
    glide: z.number(),
    volume: z.number().min(0).max(1),
    material: z.enum([
      'wood',
      'stone',
      'ceramic',
      'glass',
      'reed',
      'brass',
      'vocal'
    ]),
    color: colorSchema,
    touch: z.enum(['soft', 'normal', 'firm']),
    baseFrequency: z.number().positive(),
    reading: readingSchema,
    pitch: pitchSchema,
    spatial: spatialSchema
  })
  .partial()
  .strict()

const settingsSchema = z
  .object({
    preset: z.enum(PRESET_NAMES),
    tickHz: z.number().positive(),
    voices: z
      .object({ text: voiceSchema, thinking: voiceSchema, tool: voiceSchema })
      .partial()
      .strict()
  })
  .partial()
  .strict()

export type BlipSettings = z.infer<typeof settingsSchema>

/** The one config file. `$PI_CODING_AGENT_DIR` selects another profile. */
export const settingsPath = (): string =>
  join(
    process.env['PI_CODING_AGENT_DIR'] ?? join(homedir(), '.omp', 'agent'),
    'blips.json'
  )

export interface LoadedSettings {
  readonly config: BlipConfig
  /** The preset the config was built on. */
  readonly preset: PresetName
  /** The file the config was read from, when there was a readable one. */
  readonly source: string | undefined
  /** Human-readable reasons the file was ignored; never thrown. */
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
  divisor: patch.divisor ?? base.divisor,
  stride: patch.stride ?? base.stride,
  catchup: patch.catchup ?? base.catchup,
  toneMs: patch.toneMs ?? base.toneMs,
  decay: patch.decay ?? base.decay,
  swell: patch.swell ?? base.swell,
  hold: patch.hold ?? base.hold,
  glide: patch.glide ?? base.glide,
  volume: patch.volume ?? base.volume,
  material: patch.material ?? base.material,
  color: patch.color ?? base.color,
  touch: patch.touch ?? base.touch,
  baseFrequency: patch.baseFrequency ?? base.baseFrequency,
  reading: patch.reading ?? base.reading,
  pitch: patch.pitch ?? base.pitch,
  spatial: patch.spatial ?? base.spatial
})

/** Lay a patch over a full config. Presets and config files take the same path. */
export const applyPatch = (
  base: BlipConfig,
  patch: ConfigPatch
): BlipConfig => ({
  tickHz: patch.tickHz ?? base.tickHz,
  voices: {
    text: mergeVoice(base.voices.text, patch.voices?.text),
    thinking: mergeVoice(base.voices.thinking, patch.voices?.thinking),
    tool: mergeVoice(base.voices.tool, patch.voices?.tool)
  }
})

/** The file as it is on disk; `undefined` when there is no file at all. */
const currentSettings = (path: string): BlipSettings | string | undefined =>
  match(existsSync(path))
    .with(false, () => undefined)
    .with(true, () => readSettings(path))
    .exhaustive()

/** What one read of the file amounts to, before a preset is laid under it. */
interface Read {
  readonly source: string | undefined
  readonly problems: readonly string[]
  readonly patch: BlipSettings
}

/**
 * Defaults, then the preset, then the config file. A malformed or
 * unknown-keyed file is reported and skipped rather than silently
 * half-applied, so a typo never leaves you guessing at the sound.
 *
 * `preset` overrides the name the file asks for; the scripts audition a preset
 * that way without writing anything.
 */
export const loadSettings = (preset?: PresetName): LoadedSettings => {
  const path = settingsPath()

  const { source, problems, patch } = match(currentSettings(path))
    .with(P.nullish, (): Read => ({
      source: undefined,
      problems: [],
      patch: {}
    }))
    .with(P.string, (problem): Read => ({
      source: undefined,
      problems: [problem],
      patch: {}
    }))
    .otherwise((settings): Read => ({
      source: path,
      problems: [],
      patch: settings
    }))

  const name = preset ?? patch.preset ?? 'default'

  return {
    config: applyPatch(applyPatch(defaultConfig, presets[name].patch), patch),
    preset: name,
    source,
    problems
  }
}

const writeSettings = (
  path: string,
  settings: BlipSettings
): string | undefined =>
  match(
    ((): Error | undefined => {
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, `${JSON.stringify(settings, undefined, 2)}\n`)
        return undefined
      } catch (error) {
        return match(error)
          .with(P.instanceOf(Error), (cause) => cause)
          .otherwise((cause) => new Error(String(cause)))
      }
    })()
  )
    .with(P.instanceOf(Error), (error) => `${path}: ${error.message}`)
    .otherwise(() => undefined)

/**
 * A command edits the file instead of holding a session-only override, so the
 * next session starts where this one left off. A file that does not parse is
 * left untouched: rewriting it would throw away what was typed by hand.
 * Returns the reason when nothing was written.
 */
const save = (
  change: (current: BlipSettings) => BlipSettings
): string | undefined => {
  const path = settingsPath()

  return match(currentSettings(path))
    .with(P.string, (problem) => `not saved, ${problem}`)
    .otherwise((settings) => writeSettings(path, change(settings ?? {})))
}

type VoiceSettings = NonNullable<BlipSettings['voices']>

/** Named keys rather than a computed one, so the strict shape is kept. */
const withEnabled = (
  voices: VoiceSettings,
  kind: StreamKind,
  enabled: boolean
): VoiceSettings =>
  match(kind)
    .with('text', () => ({ ...voices, text: { ...voices.text, enabled } }))
    .with('thinking', () => ({
      ...voices,
      thinking: { ...voices.thinking, enabled }
    }))
    .with('tool', () => ({ ...voices, tool: { ...voices.tool, enabled } }))
    .exhaustive()

/** Writes only the voices the user asked about; the rest of the file stays. */
export const saveVoices = (
  enabled: Readonly<Partial<Record<StreamKind, boolean>>>
): string | undefined =>
  save((current) => ({
    ...current,
    voices: STREAM_KINDS.reduce<VoiceSettings>(
      (voices, kind) =>
        match(enabled[kind])
          .with(P.nullish, () => voices)
          .otherwise((value) => withEnabled(voices, kind, value)),
      current.voices ?? {}
    )
  }))

export const savePreset = (preset: PresetName): string | undefined =>
  save((current) => ({ ...current, preset }))
