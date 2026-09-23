import { match, P } from 'ts-pattern'
import type { StreamKind } from './config.ts'
import { type PresetName, PRESET_NAMES, presets } from './presets.ts'
import type { Session, SessionEvent } from './session.ts'
import { loadSettings, settingsPaths } from './settings.ts'

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

/** What the user asked for, before anything is read from disk. */
export type Intent =
  | { readonly type: 'toggle'; readonly kind: StreamKind }
  | { readonly type: 'all'; readonly enabled: boolean }
  | { readonly type: 'cycle' }
  | { readonly type: 'preset'; readonly name: string }
  | { readonly type: 'presets' }
  | { readonly type: 'reload' }
  | { readonly type: 'where' }
  /** Nothing to change; the answer is the message itself. */
  | { readonly type: 'say'; readonly text: string }

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
    description: 'Use a preset for the rest of the session',
    argument: { hint: '<name>', complete: presetCompletions },
    intent: (name) => ({ type: 'preset', name })
  },
  {
    name: 'presets',
    description: 'List the presets',
    intent: () => ({ type: 'presets' })
  },
  {
    name: 'reload',
    description: 'Re-read the config files',
    intent: () => ({ type: 'reload' })
  },
  {
    name: 'where',
    description: 'Show the config files that are read',
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
 * The one impure step of the session fold: `reload`, `preset`, and `where` read
 * the config files. Everything downstream of here is a pure value.
 */
export const interpret = (
  intent: Intent,
  cwd: string,
  session: Session
): SessionEvent =>
  match(intent)
    .with({ type: 'reload' }, (): SessionEvent => ({
      type: 'loaded',
      settings: loadSettings(cwd, session.chosen),
      chosen: session.chosen
    }))
    .with({ type: 'preset' }, ({ name }): SessionEvent =>
      match(named(name))
        .with(P.nullish, (): SessionEvent => ({
          type: 'say',
          text: `unknown preset "${name}"\n${presetList()}`
        }))
        .otherwise((chosen): SessionEvent => ({
          type: 'loaded',
          settings: loadSettings(cwd, chosen),
          chosen
        }))
    )
    .with({ type: 'presets' }, (): SessionEvent => ({
      type: 'say',
      text: presetList()
    }))
    .with({ type: 'where' }, (): SessionEvent => ({
      type: 'say',
      text: settingsPaths(cwd).join(', ')
    }))
    .otherwise((direct) => direct)
