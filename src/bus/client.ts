import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { createConnection, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import {
  defer,
  finalize,
  fromEvent,
  ignoreElements,
  merge,
  type Observable,
  repeat,
  retry,
  switchMap,
  takeUntil,
  tap,
  timer
} from 'rxjs'
import { match } from 'ts-pattern'
import { version } from '../../package.json'
import { stampOf } from '../hot.ts'
import { hot, type PlayCommand } from '../player.ts'
import {
  encoded,
  LOG_PATH,
  messages,
  type Notice,
  noticeSchema,
  type Request,
  socketPathOf
} from './protocol.ts'

const HERE = dirname(new URL(import.meta.url).pathname)
const DAEMON = join(HERE, 'daemon.ts')
const SRC = dirname(HERE)

/** A fresh daemon binds within a few hundred milliseconds; three seconds is ten times that. */
const CONNECT_ATTEMPTS = 60
const CONNECT_RETRY_MS = 50
const RECONNECT_MS = 500

const requestOf = (command: PlayCommand): Request =>
  match(command)
    .with({ type: 'play' }, ({ tone, at }): Request => ({
      type: 'play',
      tone,
      at: performance.timeOrigin + at
    }))
    .with({ type: 'flush' }, (): Request => ({ type: 'flush' }))
    .exhaustive()

/**
 * omp is a compiled Bun, and `BUN_BE_BUN` makes that same binary run a script
 * as plain Bun would, so the daemon needs no runtime of its own on the PATH.
 */
const summon = (path: string): void => {
  const log = openSync(LOG_PATH, 'a')
  spawn(process.execPath, [DAEMON, path], {
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, BUN_BE_BUN: '1' }
  }).unref()
  closeSync(log)
}

const opened = (path: string): Promise<Socket> => {
  const { promise, resolve, reject } = Promise.withResolvers<Socket>()
  const socket = createConnection(path)
  socket.once('connect', () => resolve(socket))
  socket.once('error', reject)
  return promise
}

/** The first refused connect starts a daemon; the ones after it wait for the daemon to bind. */
const connected = (path: string): Observable<Socket> =>
  defer(() => opened(path)).pipe(
    retry({
      count: CONNECT_ATTEMPTS,
      delay: (_error, attempt) => {
        match(attempt)
          .with(1, () => summon(path))
          .otherwise(() => undefined)
        return timer(CONNECT_RETRY_MS)
      }
    }),
    tap((socket) => {
      socket.setEncoding('utf8')
      // A daemon that dies mid-write is a closed socket, not a crash.
      socket.on('error', () => {})
    })
  )

/**
 * Sends the session's commands to the daemon for this version of the source,
 * and emits what the daemon reports. A daemon that goes away is replaced on
 * the next connect, and what the session sent in between is lost.
 */
export const attach = (
  commands: Observable<PlayCommand>
): Observable<Notice> => {
  const live = hot(commands)

  return defer(() =>
    connected(socketPathOf(`${version}-${stampOf(SRC)}`))
  ).pipe(
    switchMap((socket) =>
      merge(
        messages(socket, noticeSchema),
        live.pipe(
          tap((command) => {
            socket.write(encoded(requestOf(command)))
          }),
          ignoreElements()
        )
      ).pipe(
        takeUntil(fromEvent(socket, 'close')),
        finalize(() => socket.end())
      )
    ),
    repeat({ delay: RECONNECT_MS })
  )
}
