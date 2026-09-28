import { rmSync } from 'node:fs'
import { createConnection, createServer, type Server } from 'node:net'
import { catchError, type Observable, of, Subject } from 'rxjs'
import { match, P } from 'ts-pattern'
import { played } from '../player.ts'
import { FfplayLocator } from '../players/locate.ts'
import type { Sent } from '../players/types.ts'
import {
  encoded,
  messages,
  type Notice,
  type Request,
  requestSchema
} from './protocol.ts'

/** Long enough that a restarted session or a reloaded extension finds the device still open. */
const IDLE_EXIT_MS = 30_000
/** Grace for ffplay to drain its release before the process leaves regardless. */
const EXIT_GRACE_MS = 2_000

const log = (message: string): void => {
  console.error(`${new Date().toISOString()} [${process.pid}] ${message}`)
}

const sentOf = (sender: number, request: Request): Sent =>
  match(request)
    .with({ type: 'play' }, ({ tone, at }): Sent => ({
      type: 'play',
      sender,
      tone,
      at: at - performance.timeOrigin
    }))
    .with({ type: 'flush' }, (): Sent => ({ type: 'flush', sender }))
    .exhaustive()

/**
 * A socket file outlives a daemon that crashed. The one that cannot bind asks
 * whether anybody answers there: somebody does, so it leaves; nobody does, so
 * the file is stale and it takes the path.
 */
const listen = (server: Server, path: string): void => {
  server.on('error', (error: NodeJS.ErrnoException) =>
    match(error.code)
      .with('EADDRINUSE', () => {
        const probe = createConnection(path)
        probe.once('connect', () => {
          log('another daemon serves this path, leaving')
          probe.end()
          process.exit(0)
        })
        probe.once('error', () => {
          log('stale socket, replacing it')
          rmSync(path, { force: true })
          server.listen(path)
        })
      })
      .otherwise(() => {
        log(`cannot listen: ${error.message}`)
        process.exit(1)
      })
  )
  server.once('listening', () => log(`listening on ${path}`))
  server.listen(path)
}

const serve = (path: string): void => {
  const inbox = new Subject<Sent>()
  const locator = new FfplayLocator()
  const notices: Observable<Notice> = locator.located.pipe(
    catchError((error: unknown) =>
      of<Notice>({ type: 'failed', reason: String(error) })
    )
  )
  let clients = 0
  let senders = 0
  let idle: NodeJS.Timeout | undefined

  played(inbox, locator.path).subscribe({
    error: (error: unknown) => log(`no audio: ${String(error)}`)
  })

  const retire = (): void => {
    log('no clients, leaving')
    server.close()
    rmSync(path, { force: true })
    inbox.complete()
    setTimeout(() => process.exit(0), EXIT_GRACE_MS).unref()
  }

  const counted = (delta: number): void => {
    clients += delta
    clearTimeout(idle)
    idle = match(clients)
      .with(0, () => setTimeout(retire, IDLE_EXIT_MS))
      .otherwise(() => undefined)
  }

  const server = createServer((socket) => {
    senders += 1
    const sender = senders
    counted(1)
    socket.setEncoding('utf8')
    // A client that vanishes mid-write is a closed client, not a crash.
    socket.on('error', () => {})

    const told = notices.subscribe((notice) => {
      socket.write(encoded(notice))
    })
    const heard = messages(socket, requestSchema).subscribe((request) => {
      inbox.next(sentOf(sender, request))
    })

    socket.once('close', () => {
      told.unsubscribe()
      heard.unsubscribe()
      inbox.next({ type: 'flush', sender })
      counted(-1)
    })
  })

  counted(0)
  listen(server, path)
}

match(process.argv[2])
  .with(P.string, serve)
  .otherwise(() => {
    log('usage: daemon.ts <socket path>')
    process.exit(2)
  })
