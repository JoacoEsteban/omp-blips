import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  filter,
  fromEvent,
  map,
  mergeMap,
  type Observable,
  scan,
  takeUntil
} from 'rxjs'
import { z } from 'zod'
import { materialSchema, motionSchema, touchSchema } from '../settings.ts'

const toneSchema = z.object({
  frequency: z.number().finite().positive(),
  toneMs: z.number().finite().positive(),
  decay: z.number().finite(),
  swell: z.number().finite(),
  hold: z.number().finite(),
  glide: z.number().finite(),
  color: z.number().finite(),
  material: materialSchema,
  touch: touchSchema,
  volume: z.number().finite(),
  spatial: z.object({
    at: z.number().finite(),
    motion: motionSchema.optional()
  })
})

/** `at` is epoch milliseconds: the two processes share the wall clock, not `performance.now()`. */
export const requestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play'),
    tone: toneSchema,
    at: z.number().finite()
  }),
  z.object({ type: z.literal('flush') })
])

export type Request = z.infer<typeof requestSchema>

export const noticeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fetching'), url: z.string() }),
  z.object({
    type: z.literal('ready'),
    path: z.string(),
    fetched: z.boolean()
  }),
  z.object({ type: z.literal('failed'), reason: z.string() })
])

export type Notice = z.infer<typeof noticeSchema>

/**
 * One daemon per version of the source, so a session never talks to code it
 * was not written against, and an edit in development gets a daemon of its own.
 */
export const socketPathOf = (version: string): string =>
  join(
    process.env['XDG_RUNTIME_DIR'] ?? tmpdir(),
    `omp-blips-${process.getuid?.() ?? 0}-${version}.sock`
  )

export const LOG_PATH = join(tmpdir(), 'omp-blips-daemon.log')

export const encoded = (message: Request | Notice): string =>
  `${JSON.stringify(message)}\n`

const decoded = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

interface Framed {
  readonly rest: string
  readonly lines: readonly string[]
}

/** Newline-delimited JSON; a line that does not parse against `schema` is dropped. */
export const messages = <T>(
  socket: Socket,
  schema: z.ZodType<T>
): Observable<T> =>
  fromEvent(socket, 'data').pipe(
    scan(
      ({ rest }: Framed, chunk: unknown): Framed => {
        const parts = `${rest}${String(chunk)}`.split('\n')
        return { rest: parts.at(-1) ?? '', lines: parts.slice(0, -1) }
      },
      { rest: '', lines: [] }
    ),
    mergeMap(({ lines }) => lines),
    map((line) => schema.safeParse(decoded(line))),
    filter((parsed): parsed is z.ZodSafeParseSuccess<T> => parsed.success),
    map(({ data }) => data),
    takeUntil(fromEvent(socket, 'close'))
  )
