import type {
  ExtensionAPI,
  MessageEndEvent,
  MessageUpdateEvent
} from '@oh-my-pi/pi-coding-agent'
import { type Observable, Subject } from 'rxjs'
import type { Completion } from './commands.ts'

export type NoticeLevel = 'info' | 'warning'
export type Notify = (message: string, level: NoticeLevel) => void

/** How a request is answered. */
export interface Caller {
  readonly notify: Notify
}

export interface Invocation extends Caller {
  /** Everything typed after `/blips`. */
  readonly args: string
}

/** The `/blips` command, described by pure functions the shell registers. */
export interface CommandSpec {
  readonly name: string
  readonly description: string
  readonly completions: (argumentPrefix: string) => Completion[] | null
}

/**
 * The imperative shell. Every callback the host offers becomes an observable
 * here and nowhere else, so the rest of the extension only ever sees streams.
 */
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
  const started = new Subject<Caller>()
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
