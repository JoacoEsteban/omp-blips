import { match, P } from 'ts-pattern'
import { defaultConfig, type StreamKind, STREAM_KINDS } from './config.ts'
import type { Device } from './player.ts'
import type { LoadedSettings } from './settings.ts'
import type { Voicing } from './stream.ts'

/**
 * Everything the extension knows between two events, as one value. Nothing here
 * is mutated: an event returns the next session, and the audio follows it.
 *
 * No state outlives the config file: a command writes the file and the reducer
 * takes what the next read gave back, so a session starts where the last ended.
 */
export interface Session {
  readonly settings: LoadedSettings
  /** What the event that produced this session asks the UI to say. */
  readonly notice: string
}

export const initialSession: Session = {
  settings: {
    config: defaultConfig,
    preset: 'default',
    source: undefined,
    problems: []
  },
  notice: ''
}

/** A command that only turns voices on or off. */
export type VoiceIntent =
  | { readonly type: 'toggle'; readonly kind: StreamKind }
  | { readonly type: 'all'; readonly enabled: boolean }
  /** Bare `/blips`: silence everything, or start everything if all is silent. */
  | { readonly type: 'cycle' }

export type SessionEvent =
  /** A fresh read of the config file. */
  | { readonly type: 'loaded'; readonly settings: LoadedSettings }
  /** A read that followed a change to the voices, reported as such. */
  | { readonly type: 'switched'; readonly settings: LoadedSettings }
  | { readonly type: 'say'; readonly text: string }

const silent = (session: Session): boolean =>
  !STREAM_KINDS.some((kind) => session.settings.config.voices[kind].enabled)

/** What one kind sounds like now: no voice at all while it is off. */
export const voicingOf = (session: Session, kind: StreamKind): Voicing => ({
  voice: match(session.settings.config.voices[kind])
    .with({ enabled: false }, () => undefined)
    .otherwise((voice) => voice)
})

/** The device this session asks for. Nothing enabled means no process at all. */
export const deviceOf = (session: Session): Device => ({
  muted: silent(session)
})

const flags = (
  of: (kind: StreamKind) => boolean
): Record<StreamKind, boolean> => ({
  text: of('text'),
  thinking: of('thinking'),
  tool: of('tool')
})

/**
 * The enabled flags a voice command asks for, read against what is configured
 * now. The answer is what gets written: the file is the only place they live.
 */
export const enablement = (
  session: Session,
  intent: VoiceIntent
): Readonly<Record<StreamKind, boolean>> => {
  const { voices } = session.settings.config

  return match(intent)
    .with({ type: 'toggle' }, ({ kind }) =>
      // Flip the one kind, leave the others as they are configured.
      flags((each) => voices[each].enabled !== (each === kind))
    )
    .with({ type: 'all' }, ({ enabled }) => flags(() => enabled))
    .with({ type: 'cycle' }, () => flags(() => silent(session)))
    .exhaustive()
}

const status = ({ config }: LoadedSettings): string =>
  STREAM_KINDS.map((kind) =>
    match(config.voices[kind].enabled)
      .with(true, () => `${kind} on`)
      .with(false, () => `${kind} off`)
      .exhaustive()
  ).join(', ')

const summary = ({ preset, source, problems }: LoadedSettings): string =>
  [
    `preset ${preset}, ${match(source)
      .with(P.nullish, () => 'defaults')
      .otherwise((path) => path)}`,
    ...problems
  ].join(' | ')

/** The one place session state changes, and it changes by returning a new one. */
export const reduce = (session: Session, event: SessionEvent): Session =>
  match(event)
    .with({ type: 'loaded' }, ({ settings }) => ({
      settings,
      notice: summary(settings)
    }))
    .with({ type: 'switched' }, ({ settings }) => ({
      settings,
      notice: [status(settings), ...settings.problems].join(' | ')
    }))
    .with({ type: 'say', text: P.select() }, (text) => ({
      ...session,
      notice: text
    }))
    .exhaustive()
