import { match, P } from 'ts-pattern'
import { defaultConfig, type StreamKind, STREAM_KINDS } from './config.ts'
import type { Device } from './player.ts'
import type { LoadedSettings } from './settings.ts'
import type { Voicing } from './stream.ts'

export interface Session {
  readonly settings: LoadedSettings
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

export type VoiceIntent =
  | { readonly type: 'toggle'; readonly kind: StreamKind }
  | { readonly type: 'all'; readonly enabled: boolean }
  /** Bare `/blips`: silence everything, or start everything if all is silent. */
  | { readonly type: 'cycle' }

export type SessionEvent =
  | { readonly type: 'loaded'; readonly settings: LoadedSettings }
  | { readonly type: 'switched'; readonly settings: LoadedSettings }
  | { readonly type: 'say'; readonly text: string }

const silent = (session: Session): boolean =>
  !STREAM_KINDS.some((kind) => session.settings.config.voices[kind].enabled)

export const voicingOf = (session: Session, kind: StreamKind): Voicing => ({
  voice: match(session.settings.config.voices[kind])
    .with({ enabled: false }, () => undefined)
    .otherwise((voice) => voice)
})

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

/** The answer is what gets written: the file is the only place they live. */
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
