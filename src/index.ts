import type {
  ExtensionAPI,
  MessageEndEvent,
  MessageUpdateEvent
} from '@oh-my-pi/pi-coding-agent'
import { match, P } from 'ts-pattern'
import { defaultConfig, type BlipConfig, type StreamKind } from './config.ts'
import { pitchFromCharacter } from './pitch.ts'
import { createPlayer, type VoicedPlayer } from './player.ts'
import { type PresetName, presetNames, presets } from './presets.ts'
import { loadSettings, settingsPaths } from './settings.ts'

interface Chunk {
  readonly kind: StreamKind
  readonly delta: string
}

const KINDS = ['text', 'thinking', 'tool'] as const

/** Prose, reasoning, and tool arguments all stream as deltas; each gets its own voice. */
const chunkOf = (
  event: MessageUpdateEvent['assistantMessageEvent']
): Chunk | undefined =>
  match(event)
    .with({ type: 'text_delta', delta: P.select(P.string) }, (delta) => ({
      kind: 'text' as const,
      delta
    }))
    .with({ type: 'thinking_delta', delta: P.select(P.string) }, (delta) => ({
      kind: 'thinking' as const,
      delta
    }))
    .with({ type: 'toolcall_delta', delta: P.select(P.string) }, (delta) => ({
      kind: 'tool' as const,
      delta
    }))
    .otherwise(() => undefined)

/**
 * A user abort or a provider failure ends the stream mid-sentence. It arrives
 * as the terminal `error` event while streaming.
 */
const isInterrupt = (
  event: MessageUpdateEvent['assistantMessageEvent']
): boolean =>
  match(event)
    .with({ type: 'error' }, () => true)
    .otherwise(() => false)

/** The same interruption seen from the finished message, in case no `error` event arrived. */
const stoppedEarly = (message: MessageEndEvent['message']): boolean =>
  match(message)
    .with(
      { role: 'assistant', stopReason: P.union('aborted', 'error') },
      () => true
    )
    .otherwise(() => false)

/**
 * Structural stand-in for pi-tui's `AutocompleteItem`: the TUI package is only a
 * transitive dependency, so the shape is restated rather than imported.
 */
interface Completion {
  readonly value: string
  readonly label: string
  readonly description: string
  readonly hint?: string
}

interface Subcommand {
  readonly name: string
  readonly description: string
  /** Set when a further word follows the name; says how to complete it. */
  readonly argument?: {
    readonly hint: string
    readonly complete: (prefix: string) => readonly Completion[]
  }
  readonly run: (argument: string, cwd: string) => string
}

const presetList = (): string =>
  presetNames.map((key) => `${key} — ${presets[key].description}`).join('\n')

/** Second-level items repeat their subcommand: the chosen `value` replaces the whole argument. */
const presetCompletions = (prefix: string): readonly Completion[] =>
  presetNames
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({
      value: `preset ${name}`,
      label: name,
      description: presets[name].description
    }))

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

const argumentItems = (
  subcommands: readonly Subcommand[],
  name: string,
  prefix: string
): readonly Completion[] =>
  match(subcommands.find((sub) => sub.name === name))
    .with({ argument: { complete: P.select() } }, (complete) =>
      complete(prefix)
    )
    .otherwise(() => [])

/**
 * The TUI hands over everything typed after `/blips` and replaces all of it with
 * the chosen `value`. A prefix with no space is still the subcommand word;
 * anything past the first space belongs to that subcommand.
 */
const completionsFor = (
  subcommands: readonly Subcommand[],
  argumentPrefix: string
): readonly Completion[] =>
  match(/^(\S*)\s+(.*)$/s.exec(argumentPrefix))
    .with(
      [P._, P.select('name', P.string), P.select('rest', P.string)],
      ({ name, rest }) =>
        argumentItems(
          subcommands,
          name.toLowerCase(),
          rest.trimStart().toLowerCase()
        )
    )
    .otherwise(() =>
      subcommands
        .filter((sub) => sub.name.startsWith(argumentPrefix.toLowerCase()))
        .map(itemFor)
    )

/** The dropdown wants `null` rather than an empty list when nothing matches. */
const offer = (items: readonly Completion[]): Completion[] | null =>
  match(items)
    .with([], () => null)
    .otherwise((found) => [...found])

const usage = (subcommands: readonly Subcommand[]): string =>
  `/blips [${subcommands
    .map((sub) =>
      match(sub.argument)
        .with(P.nullish, () => sub.name)
        .otherwise(({ hint }) => `${sub.name} ${hint}`)
    )
    .join('|')}]`

/** Everything after `/blips `, split into the subcommand word and the rest. */
const parse = (args: string): readonly [string, string] =>
  match(/^(\S+)\s*(.*)$/s.exec(args.trim()))
    .with(
      [P._, P.select('name', P.string), P.select('rest', P.string)],
      ({ name, rest }): readonly [string, string] => [
        name.toLowerCase(),
        rest.trim()
      ]
    )
    .otherwise((): readonly [string, string] => ['', ''])

export default function blips(pi: ExtensionAPI): void {
  let config: BlipConfig = defaultConfig
  let player: VoicedPlayer = createPlayer(config)
  /**
   * A `/blips` toggle is a session override laid over the configured value, not
   * a copy of it: a later `reload` or `preset` rebuilds the config underneath
   * without discarding what the user asked for.
   */
  const override: Record<StreamKind, boolean | undefined> = {
    text: undefined,
    thinking: undefined,
    tool: undefined
  }
  const pending: Record<StreamKind, number> = { text: 0, thinking: 0, tool: 0 }
  const isEnabled = (kind: StreamKind): boolean =>
    override[kind] ?? config.voices[kind].enabled
  const clearPending = (): void => {
    for (const kind of KINDS) pending[kind] = 0
  }

  let chosen: PresetName | undefined

  /** Re-read `blips.json`, rebuild the player, and report what happened. */
  const reload = (cwd: string): string => {
    const {
      config: loaded,
      preset,
      sources,
      problems
    } = loadSettings(cwd, chosen)
    player.dispose()
    config = loaded
    player = createPlayer(config)

    const from = sources.length === 0 ? 'defaults' : sources.join(', ')
    return [`preset ${preset}, ${config.backend}, ${from}`, ...problems].join(
      ' | '
    )
  }

  /** `/blips preset <name>` holds until the session ends; a bad name lists the options. */
  const usePreset = (cwd: string, name: string): string =>
    match(presetNames.find((candidate) => candidate === name))
      .with(P.nullish, () => `unknown preset "${name}"\n${presetList()}`)
      .otherwise((valid) => {
        chosen = valid
        return reload(cwd)
      })

  pi.on('session_start', async (_event, ctx) => {
    const summary = reload(ctx.cwd)
    if (summary.includes('|')) ctx.ui.notify(`Blips: ${summary}`, 'warning')
  })

  pi.on('message_update', async (event) => {
    // An interrupted stream leaves blips ringing for text that is no longer
    // coming, and a half-spent budget for the next one.
    if (isInterrupt(event.assistantMessageEvent)) {
      player.flush()
      clearPending()
      return
    }

    const chunk = chunkOf(event.assistantMessageEvent)
    if (chunk === undefined || !isEnabled(chunk.kind)) return

    const voice = config.voices[chunk.kind]
    for (const char of chunk.delta) {
      // Silent characters must not spend the budget: counting them would make
      // the effective rate depend on how much punctuation the stream holds.
      const frequency = pitchFromCharacter(char, voice)
      if (frequency === undefined) continue

      pending[chunk.kind] += 1
      if (pending[chunk.kind] < voice.charsPerBlip) continue
      pending[chunk.kind] = 0

      player.play(chunk.kind, {
        frequency,
        toneMs: voice.toneMs,
        decay: voice.decay,
        material: voice.material,
        touch: voice.touch,
        volume: voice.volume
      })
    }
  })

  pi.on('message_end', async (event) => {
    if (stoppedEarly(event.message)) player.flush()
    clearPending()
  })

  pi.on('session_shutdown', async () => {
    player.dispose()
  })

  const status = (): string =>
    KINDS.map((kind) => `${kind} ${isEnabled(kind) ? 'on' : 'off'}`).join(', ')

  const setAll = (on: boolean): string => {
    for (const kind of KINDS) override[kind] = on
    if (!on) player.dispose()
    return status()
  }

  const toggle = (kind: StreamKind): string => {
    override[kind] = !isEnabled(kind)
    return status()
  }

  /** One table drives the handler, the usage line, and the dropdown. */
  const subcommands: readonly Subcommand[] = [
    { name: 'on', description: 'Play every voice', run: () => setAll(true) },
    {
      name: 'off',
      description: 'Silence every voice',
      run: () => setAll(false)
    },
    {
      name: 'text',
      description: 'Toggle the prose voice',
      run: () => toggle('text')
    },
    {
      name: 'thinking',
      description: 'Toggle the reasoning voice',
      run: () => toggle('thinking')
    },
    {
      name: 'tool',
      description: 'Toggle the tool-argument voice',
      run: () => toggle('tool')
    },
    {
      name: 'preset',
      description: 'Use a preset for the rest of the session',
      argument: { hint: '<name>', complete: presetCompletions },
      run: (argument, cwd) => usePreset(cwd, argument)
    },
    {
      name: 'presets',
      description: 'List the presets',
      run: () => presetList()
    },
    {
      name: 'reload',
      description: 'Re-read the config files',
      run: (_argument, cwd) => reload(cwd)
    },
    {
      name: 'where',
      description: 'Show the config files that are read',
      run: (_argument, cwd) => settingsPaths(cwd).join(', ')
    }
  ]

  pi.registerCommand('blips', {
    description: `Blips: ${usage(subcommands)}`,
    getArgumentCompletions: (argumentPrefix) =>
      offer(completionsFor(subcommands, argumentPrefix)),
    handler: async (args, ctx) => {
      const [name, argument] = parse(args)

      const message = match(subcommands.find((sub) => sub.name === name))
        .with(P.nonNullable, (sub) => sub.run(argument, ctx.cwd))
        .otherwise(() =>
          match(name)
            .with('', () => setAll(!KINDS.some(isEnabled)))
            .otherwise(
              (unknown) => `unknown "${unknown}" — ${usage(subcommands)}`
            )
        )

      ctx.ui.notify(`Blips: ${message}`, 'info')
    }
  })
}
