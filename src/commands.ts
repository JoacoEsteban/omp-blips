import { match, P } from 'ts-pattern'
import { type PresetName, PRESET_NAMES, presets } from './presets.ts'
import {
  enablement,
  type Session,
  type SessionEvent,
  type VoiceIntent
} from './session.ts'
import {
  loadSettings,
  savePreset,
  settingsPath,
  saveVoices
} from './settings.ts'

/**
 * Structural stand-in for pi-tui's `AutocompleteItem`: the TUI package is only a
 * transitive dependency, so the shape is restated rather than imported.
 */
export interface Completion {
  readonly value: string
  readonly label: string
  readonly description: string
  readonly hint?: string
}

/** What the user asked for, before anything is read from or written to disk. */
export type Intent =
  | VoiceIntent
  | { readonly type: 'preset'; readonly name: string }
  | { readonly type: 'presets' }
  | { readonly type: 'reload' }
  | { readonly type: 'where' }
  /** Pick a preset by ear; the answer is whatever the tuner comes back with. */
  | { readonly type: 'tune' }
  /** Nothing to change; the answer is the message itself. */
  | { readonly type: 'say'; readonly text: string }

/**
 * An intent the session can answer on its own. `tune` is the one intent that
 * has to go through the user first, so it never reaches the fold.
 */
export type Settled = Exclude<Intent, { readonly type: 'tune' }>

interface Subcommand {
  readonly name: string
  readonly description: string
  /** Set when a further word follows the name; says how to complete it. */
  readonly argument?: {
    readonly hint: string
    readonly complete: (prefix: string) => readonly Completion[]
  }
  readonly intent: (argument: string) => Intent
}

const presetList = (): string =>
  PRESET_NAMES.map((key) => `${key} — ${presets[key].description}`).join('\n')

/** Second-level items repeat their subcommand: the chosen `value` replaces the whole argument. */
const presetCompletions = (prefix: string): readonly Completion[] =>
  PRESET_NAMES.filter((name) => name.startsWith(prefix)).map((name) => ({
    value: `preset ${name}`,
    label: name,
    description: presets[name].description
  }))

/** One table drives the intents, the usage line, and the dropdown. */
const SUBCOMMANDS: readonly Subcommand[] = [
  {
    name: 'on',
    description: 'Play every voice',
    intent: () => ({ type: 'all', enabled: true })
  },
  {
    name: 'off',
    description: 'Silence every voice',
    intent: () => ({ type: 'all', enabled: false })
  },
  {
    name: 'text',
    description: 'Toggle the prose voice',
    intent: () => ({ type: 'toggle', kind: 'text' })
  },
  {
    name: 'thinking',
    description: 'Toggle the reasoning voice',
    intent: () => ({ type: 'toggle', kind: 'thinking' })
  },
  {
    name: 'tool',
    description: 'Toggle the tool-argument voice',
    intent: () => ({ type: 'toggle', kind: 'tool' })
  },
  {
    name: 'preset',
    description: 'Pick a preset by ear, or name one to use from now on',
    argument: { hint: '[name]', complete: presetCompletions },
    intent: (name) =>
      match(name)
        .with('', (): Intent => ({ type: 'tune' }))
        .otherwise((chosen): Intent => ({ type: 'preset', name: chosen }))
  },
  {
    name: 'presets',
    description: 'List the presets',
    intent: () => ({ type: 'presets' })
  },
  {
    name: 'reload',
    description: 'Re-read the config file',
    intent: () => ({ type: 'reload' })
  },
  {
    name: 'where',
    description: 'Show the config file that is read',
    intent: () => ({ type: 'where' })
  }
]

export const usage = (): string =>
  `/blips [${SUBCOMMANDS.map((sub) =>
    match(sub.argument)
      .with(P.nullish, () => sub.name)
      .otherwise(({ hint }) => `${sub.name} ${hint}`)
  ).join('|')}]`

const itemFor = (sub: Subcommand): Completion =>
  match(sub.argument)
    .with(P.nullish, () => ({
      value: sub.name,
      label: sub.name,
      description: sub.description
    }))
    .otherwise(({ hint }) => ({
      value: `${sub.name} `,
      label: sub.name,
      description: sub.description,
      hint
    }))

const argumentItems = (name: string, prefix: string): readonly Completion[] =>
  match(SUBCOMMANDS.find((sub) => sub.name === name))
    .with({ argument: { complete: P.select() } }, (complete) =>
      complete(prefix)
    )
    .otherwise(() => [])

/**
 * The TUI hands over everything typed after `/blips` and replaces all of it with
 * the chosen `value`. A prefix with no space is still the subcommand word;
 * anything past the first space belongs to that subcommand.
 */
const completionsFor = (argumentPrefix: string): readonly Completion[] =>
  match(/^(\S*)\s+(.*)$/s.exec(argumentPrefix))
    .with(
      [P._, P.select('name', P.string), P.select('rest', P.string)],
      ({ name, rest }) =>
        argumentItems(name.toLowerCase(), rest.trimStart().toLowerCase())
    )
    .otherwise(() =>
      SUBCOMMANDS.filter((sub) =>
        sub.name.startsWith(argumentPrefix.toLowerCase())
      ).map(itemFor)
    )

/** The dropdown wants `null` rather than an empty list when nothing matches. */
export const completions = (argumentPrefix: string): Completion[] | null =>
  match(completionsFor(argumentPrefix))
    .with([], () => null)
    .otherwise((found) => [...found])

/** Everything after `/blips `, split into the subcommand word and the rest. */
const split = (args: string): readonly [string, string] =>
  match(/^(\S+)\s*(.*)$/s.exec(args.trim()))
    .with(
      [P._, P.select('name', P.string), P.select('rest', P.string)],
      ({ name, rest }): readonly [string, string] => [
        name.toLowerCase(),
        rest.trim()
      ]
    )
    .otherwise((): readonly [string, string] => ['', ''])

export const parse = (args: string): Intent => {
  const [name, argument] = split(args)

  return match(SUBCOMMANDS.find((sub) => sub.name === name))
    .with(P.nonNullable, (sub) => sub.intent(argument))
    .otherwise(() =>
      match(name)
        .with('', (): Intent => ({ type: 'cycle' }))
        .otherwise((unknown): Intent => ({
          type: 'say',
          text: `unknown "${unknown}" — ${usage()}`
        }))
    )
}

const named = (name: string): PresetName | undefined =>
  PRESET_NAMES.find((candidate) => candidate === name)

/**
 * The one impure step of the session fold: a command reads the config file,
 * and a command that changes something writes it first. Everything downstream
 * of here is a pure value.
 *
 * A write that fails changes nothing, so its reason is the whole answer.
 */
export const interpret = (intent: Settled, session: Session): SessionEvent =>
  match(intent)
    .with({ type: P.union('toggle', 'all', 'cycle') }, (voice): SessionEvent =>
      match(saveVoices(enablement(session, voice)))
        .with(P.string, (problem): SessionEvent => ({
          type: 'say',
          text: problem
        }))
        .otherwise((): SessionEvent => ({
          type: 'switched',
          settings: loadSettings()
        }))
    )
    .with({ type: 'reload' }, (): SessionEvent => ({
      type: 'loaded',
      settings: loadSettings()
    }))
    .with({ type: 'preset' }, ({ name }): SessionEvent =>
      match(named(name))
        .with(P.nullish, (): SessionEvent => ({
          type: 'say',
          text: `unknown preset "${name}"\n${presetList()}`
        }))
        .otherwise((chosen): SessionEvent =>
          match(savePreset(chosen))
            .with(P.string, (problem): SessionEvent => ({
              type: 'say',
              text: problem
            }))
            .otherwise((): SessionEvent => ({
              type: 'loaded',
              settings: loadSettings()
            }))
        )
    )
    .with({ type: 'presets' }, (): SessionEvent => ({
      type: 'say',
      text: presetList()
    }))
    .with({ type: 'where' }, (): SessionEvent => ({
      type: 'say',
      text: settingsPath()
    }))
    .with({ type: 'say' }, (said): SessionEvent => said)
    .exhaustive()
