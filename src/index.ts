import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import {
  catchError,
  EMPTY,
  filter,
  ignoreElements,
  map,
  merge,
  type Observable,
  scan,
  share,
  shareReplay,
  startWith,
  takeUntil,
  tap
} from 'rxjs'
import { match } from 'ts-pattern'
import {
  completions,
  type Intent,
  interpret,
  parse,
  usage
} from './commands.ts'
import { extensionStreams, type NoticeLevel, type Notify } from './events.ts'
import { flush, play, playback } from './player.ts'
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
  isInterrupt,
  stoppedEarly
} from './stream.ts'

/** Something the user asked of the session, plus how to answer it. */
interface Request {
  readonly intent: Intent
  readonly cwd: string
  readonly notify: Notify
  readonly level: NoticeLevel
  /** A session start only speaks when a config file was rejected. */
  readonly quiet: boolean
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
  const session = reduce(
    step.session,
    interpret(request.intent, request.cwd, step.session)
  )
  return { session, answer: answerFor(request, session) }
}

export default function blips(pi: ExtensionAPI): void {
  const io = extensionStreams(pi, {
    name: 'blips',
    description: `Blips: ${usage()}`,
    completions
  })

  const requests: Observable<Request> = merge(
    io.started.pipe(
      map(({ cwd, notify }) => ({
        intent: { type: 'reload' } as const,
        cwd,
        notify,
        level: 'warning' as const,
        quiet: true
      }))
    ),
    io.invoked.pipe(
      map(({ args, cwd, notify }) => ({
        intent: parse(args),
        cwd,
        notify,
        level: 'info' as const,
        quiet: false
      }))
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
    shareReplay({ bufferSize: 1, refCount: false })
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
   * coming, and a half-spent budget for the next message. The end of a message
   * clears the budget either way.
   */
  const silenced = merge(interrupted, io.ended.pipe(filter(stoppedEarly)))
  const restart = merge(interrupted, io.ended)

  const commands = merge(
    blipsFrom(
      chunks,
      (kind) => session.pipe(map((current) => voicingOf(current, kind))),
      restart
    ).pipe(map(({ tone }) => play(tone))),
    silenced.pipe(map(() => flush()))
  )

  const audio = playback(session.pipe(map(deviceOf)), commands).pipe(
    // A dead device must not take the session down with it.
    catchError(() => EMPTY)
  )

  merge(notices, audio).pipe(takeUntil(io.shutdown)).subscribe()
}
