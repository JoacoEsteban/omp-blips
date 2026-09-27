import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import {
  catchError,
  combineLatest,
  EMPTY,
  filter,
  from,
  ignoreElements,
  map,
  merge,
  mergeMap,
  type Observable,
  of,
  scan,
  share,
  shareReplay,
  startWith,
  takeUntil,
  tap
} from 'rxjs'
import { match, P } from 'ts-pattern'
import {
  completions,
  type Intent,
  interpret,
  parse,
  type Settled,
  usage
} from './commands.ts'
import { extensionStreams, type NoticeLevel, type Notify } from './events.ts'
import { type Device, flush, play, playback } from './player.ts'
import type { PresetName } from './presets.ts'
import {
  deviceOf,
  initialSession,
  reduce,
  type Session,
  voicingOf
} from './session.ts'
import {
  blipsFrom,
  type Chunk,
  chunkOf,
  gridFrom,
  isInterrupt,
  stoppedEarly
} from './stream.ts'
import { createTuner, type Surface, type Tuner } from './tuner.ts'

/** Something the user asked of the session, plus how to answer it. */
interface Ask {
  readonly intent: Intent
  readonly notify: Notify
  readonly level: NoticeLevel
  /** A session start only speaks when the config file was rejected. */
  readonly quiet: boolean
  /** Where a dialog can be drawn, when the ask came from a terminal. */
  readonly surface: Surface | undefined
}

/** An ask the session can fold, once the tuner has had its say. */
interface Request extends Omit<Ask, 'intent'> {
  readonly intent: Settled
}

/** What the UI is told about one request. */
interface Answer {
  readonly notify: Notify
  readonly text: string
  readonly level: NoticeLevel
}

/** One turn of the fold: the session that a request produced, and its answer. */
interface Step {
  readonly session: Session
  readonly answer: Answer | undefined
}

const answerFor = (request: Request, session: Session): Answer | undefined =>
  match(request.quiet && session.settings.problems.length === 0)
    .with(true, () => undefined)
    .with(false, () => ({
      notify: request.notify,
      text: session.notice,
      level: request.level
    }))
    .exhaustive()

const stepOf = (step: Step, request: Request): Step => {
  const session = reduce(step.session, interpret(request.intent, step.session))
  return { session, answer: answerFor(request, session) }
}

/**
 * The preset the tuner came back with is the command the user would otherwise
 * have typed, so it joins the same fold as every other request.
 */
const kept = (preset: PresetName | undefined): Settled =>
  match(preset)
    .with(P.nullish, (): Settled => ({ type: 'say', text: 'preset unchanged' }))
    .otherwise((name): Settled => ({ type: 'preset', name }))

/** The one intent that has to reach the user before the session can fold it. */
const settled = (ask: Ask, tuner: Tuner): Observable<Settled> =>
  match(ask.intent)
    .with({ type: 'tune' }, () =>
      match(ask.surface)
        .with(P.nullish, () =>
          of<Settled>({
            type: 'say',
            text: 'picking a preset by ear needs an interactive terminal'
          })
        )
        .otherwise((surface) => from(tuner.open(surface)).pipe(map(kept)))
    )
    .otherwise((intent) => of(intent))

/** The tuner holds the device open while it auditions a preset. */
const deviceFor = ([device, tuning]: readonly [Device, boolean]): Device => ({
  muted: device.muted && !tuning
})

export default function blips(pi: ExtensionAPI): void {
  const io = extensionStreams(pi, {
    name: 'blips',
    description: `Blips: ${usage()}`,
    completions
  })

  const tuner = createTuner()

  const asks: Observable<Ask> = merge(
    io.started.pipe(
      map(({ notify }) => ({
        intent: { type: 'reload' } as const,
        notify,
        level: 'warning' as const,
        quiet: true,
        surface: undefined
      }))
    ),
    io.invoked.pipe(
      map(({ args, notify, surface }) => ({
        intent: parse(args),
        notify,
        level: 'info' as const,
        quiet: false,
        surface
      }))
    )
  )

  const requests: Observable<Request> = asks.pipe(
    mergeMap((ask) =>
      settled(ask, tuner).pipe(map((intent) => ({ ...ask, intent })))
    )
  )

  /** The session is a fold over the requests, and nothing else writes to it. */
  const steps = requests.pipe(
    scan(stepOf, { session: initialSession, answer: undefined }),
    share()
  )

  const session = steps.pipe(
    map((step) => step.session),
    startWith(initialSession),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  const notices = steps.pipe(
    map((step) => step.answer),
    filter((answer): answer is Answer => answer !== undefined),
    tap(({ notify, text, level }) => {
      notify(`Blips: ${text}`, level)
    }),
    ignoreElements()
  )

  const chunks = io.assistant.pipe(
    map(chunkOf),
    filter((chunk): chunk is Chunk => chunk !== undefined)
  )
  const interrupted = io.assistant.pipe(filter(isInterrupt))

  /**
   * An interrupted stream leaves blips ringing for text that is no longer
   * coming, and an unread tail for the next message. The end of a message
   * clears the cursors either way.
   */
  const silenced = merge(interrupted, io.ended.pipe(filter(stoppedEarly)))
  const restart = merge(interrupted, io.ended)

  /** One grid for the three voices, so they lock to each other. */
  const ticks = gridFrom(
    session.pipe(map((current) => current.settings.config.tickHz))
  )

  const commands = merge(
    blipsFrom(
      chunks,
      (kind) => session.pipe(map((current) => voicingOf(current, kind))),
      restart,
      ticks
    ).pipe(map(({ tone, at }) => play(tone, at))),
    silenced.pipe(map(() => flush())),
    tuner.audition
  ).pipe(takeUntil(io.shutdown))

  const devices = combineLatest([
    session.pipe(map(deviceOf)),
    tuner.active
  ]).pipe(map(deviceFor))

  const audio = playback(devices, commands).pipe(
    // A dead device must not take the session down with it.
    catchError(() => EMPTY)
  )

  merge(notices, audio).pipe(takeUntil(io.shutdown)).subscribe()
}
