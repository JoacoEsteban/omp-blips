import type {
  ExtensionAPI,
  MessageEndEvent,
  MessageUpdateEvent
} from '@oh-my-pi/pi-coding-agent'
import { type Observable, ReplaySubject, Subject } from 'rxjs'
import { match } from 'ts-pattern'
import type { Completion } from './commands.ts'
import type { Surface } from './tuner.ts'

export type NoticeLevel = 'info' | 'warning'
export type Notify = (message: string, level: NoticeLevel) => void

export interface Caller {
  readonly notify: Notify
}

export interface Invocation extends Caller {
  readonly args: string
  readonly surface: Surface | undefined
}

export interface CommandSpec {
  readonly name: string
  readonly description: string
  readonly completions: (argumentPrefix: string) => Completion[] | null
}

export interface ExtensionStreams {
  readonly started: Observable<Caller>
  readonly invoked: Observable<Invocation>
  readonly assistant: Observable<MessageUpdateEvent['assistantMessageEvent']>
  readonly ended: Observable<MessageEndEvent['message']>
  readonly shutdown: Observable<void>
}

export const extensionStreams = (
  pi: ExtensionAPI,
  command: CommandSpec
): ExtensionStreams => {
  const started = new ReplaySubject<Caller>(1)
  const invoked = new Subject<Invocation>()
  const assistant = new Subject<MessageUpdateEvent['assistantMessageEvent']>()
  const ended = new Subject<MessageEndEvent['message']>()
  const shutdown = new Subject<void>()

  pi.on('session_start', (_event, ctx) => {
    started.next({
      notify: (message, level) => {
        ctx.ui.notify(message, level)
      }
    })
  })

  pi.on('message_update', (event) => {
    assistant.next(event.assistantMessageEvent)
  })

  pi.on('message_end', (event) => {
    ended.next(event.message)
  })

  pi.on('session_shutdown', () => {
    shutdown.next()
    shutdown.complete()
  })

  pi.registerCommand(command.name, {
    description: command.description,
    getArgumentCompletions: (argumentPrefix) =>
      command.completions(argumentPrefix),
    handler: async (args, ctx) => {
      invoked.next({
        args,
        // A custom component only has somewhere to draw in the terminal.
        surface: match(ctx.mode)
          .with('tui', () => ctx.ui)
          .otherwise(() => undefined),
        notify: (message, level) => {
          ctx.ui.notify(message, level)
        }
      })
    }
  })

  return {
    started: started.asObservable(),
    invoked: invoked.asObservable(),
    assistant: assistant.asObservable(),
    ended: ended.asObservable(),
    shutdown: shutdown.asObservable()
  }
}
