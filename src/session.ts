import { match, P } from 'ts-pattern'
import { defaultConfig, type StreamKind } from './config.ts'
import type { Device } from './player.ts'
import type { PresetName } from './presets.ts'
import type { LoadedSettings } from './settings.ts'
import type { Voicing } from './stream.ts'

const KINDS = ['text', 'thinking', 'tool'] as const

/**
 * Everything the extension knows between two events, as one value. Nothing here
 * is mutated: an event returns the next session, and the audio follows it.
 */
export interface Session {
  readonly settings: LoadedSettings
  /** The preset `/blips preset` asked for, kept across a reload. */
  readonly chosen: PresetName | undefined
  /**
   * A `/blips` toggle is a session override laid over the configured value, not
   * a copy of it: a later `reload` or `preset` rebuilds the config underneath
   * without discarding what the user asked for.
   */
  readonly overrides: Readonly<Record<StreamKind, boolean | undefined>>
  /** What the event that produced this session asks the UI to say. */
  readonly notice: string
}

export const initialSession: Session = {
  settings: {
    config: defaultConfig,
    preset: 'default',
    sources: [],
    problems: []
  },
  chosen: undefined,
  overrides: { text: undefined, thinking: undefined, tool: undefined },
  notice: ''
}

export type SessionEvent =
  | {
      readonly type: 'loaded'
      readonly settings: LoadedSettings
      readonly chosen: PresetName | undefined
    }
  | { readonly type: 'toggle'; readonly kind: StreamKind }
  | { readonly type: 'all'; readonly enabled: boolean }
  /** Bare `/blips`: silence everything, or start everything if all is silent. */
  | { readonly type: 'cycle' }
  | { readonly type: 'say'; readonly text: string }

const enabled = (session: Session, kind: StreamKind): boolean =>
  session.overrides[kind] ?? session.settings.config.voices[kind].enabled

const silent = (session: Session): boolean =>
  !KINDS.some((kind) => enabled(session, kind))

/** What one kind sounds like now: no voice at all while it is off. */
export const voicingOf = (session: Session, kind: StreamKind): Voicing => ({
  voice: match(enabled(session, kind))
    .with(true, () => session.settings.config.voices[kind])
    .with(false, () => undefined)
    .exhaustive(),
  minIntervalMs: session.settings.config.minIntervalMs
})

/** The device this session asks for. Nothing enabled means no process at all. */
export const deviceOf = (session: Session): Device => ({
  backend: session.settings.config.backend,
  muted: silent(session)
})

const status = (session: Session): string =>
  KINDS.map((kind) =>
    match(enabled(session, kind))
      .with(true, () => `${kind} on`)
      .with(false, () => `${kind} off`)
      .exhaustive()
  ).join(', ')

const summary = ({
  config,
  preset,
  sources,
  problems
}: LoadedSettings): string =>
  [
    `preset ${preset}, ${config.backend}, ${match(sources)
      .with([], () => 'defaults')
      .otherwise((found) => found.join(', '))}`,
    ...problems
  ].join(' | ')

const override = (
  session: Session,
  kind: StreamKind,
  value: boolean
): Session['overrides'] => ({ ...session.overrides, [kind]: value })

const everything = (value: boolean): Session['overrides'] => ({
  text: value,
  thinking: value,
  tool: value
})

/** The one place session state changes, and it changes by returning a new one. */
export const reduce = (session: Session, event: SessionEvent): Session =>
  match(event)
    .with({ type: 'loaded' }, ({ settings, chosen }) => ({
      ...session,
      settings,
      chosen,
      notice: summary(settings)
    }))
    .with({ type: 'toggle' }, ({ kind }) => {
      const next = {
        ...session,
        overrides: override(session, kind, !enabled(session, kind))
      }
      return { ...next, notice: status(next) }
    })
    .with({ type: 'all' }, ({ enabled: value }) => {
      const next = { ...session, overrides: everything(value) }
      return { ...next, notice: status(next) }
    })
    .with({ type: 'cycle' }, () => {
      const next = { ...session, overrides: everything(silent(session)) }
      return { ...next, notice: status(next) }
    })
    .with({ type: 'say', text: P.select() }, (text) => ({
      ...session,
      notice: text
    }))
    .exhaustive()
