import { dirname, join } from 'node:path'
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import type { Subscription } from 'rxjs'
import { match, P } from 'ts-pattern'
import { type CommandSpec, extensionStreams, type Notify } from './events.ts'
import { developing, stampOf, watchSource } from './hot.ts'
import * as loaded from './runtime.ts'
import type { Start } from './runtime.ts'

const SRC = dirname(new URL(import.meta.url).pathname)
const RUNTIME = join(SRC, 'runtime.ts')

const nothing = (): undefined => undefined

interface Graph {
  readonly completions: CommandSpec['completions']
  readonly usage: () => string
  readonly start: Start
}

/**
 * The one specifier that cannot be static: the tag is what makes Bun evaluate
 * the graph again instead of answering from its module cache. The static import
 * above is what puts that graph in front of omp's loader, which only rewrites
 * modules it can reach from the entry.
 */
const imported = (generation: string): Promise<Graph | Error> =>
  import(`${RUNTIME}?mtime=${generation}`).catch((cause: unknown) =>
    match(cause)
      .with(P.instanceOf(Error), (error) => error)
      .otherwise((raw) => new Error(String(raw)))
  )

export default function blips(pi: ExtensionAPI): void {
  let graph: Graph = loaded
  let live: Subscription | undefined
  let generation = stampOf(SRC)

  const io = extensionStreams(pi, {
    name: 'blips',
    description: `Blips: ${graph.usage()}`,
    completions: (argumentPrefix) => graph.completions(argumentPrefix)
  })

  live = graph.start(io)

  match(developing(dirname(SRC)))
    .with(false, nothing)
    .with(true, () => {
      let announce: Notify = nothing
      io.started.subscribe(({ notify }) => {
        announce = notify
      })

      /**
       * The next graph is in hand before the running one is torn down, so a
       * save that does not load leaves the session playing what it had.
       */
      const reload = (): void => {
        generation = stampOf(SRC)
        void imported(generation).then((next) =>
          match(next)
            .with(P.instanceOf(Error), ({ message }) => {
              announce(
                `Blips: reload failed, still on the loaded graph — ${message}`,
                'warning'
              )
            })
            .otherwise((fresh) => {
              live?.unsubscribe()
              graph = fresh
              live = fresh.start(io)
              announce('Blips: source read again', 'info')
            })
        )
      }

      /** A save that leaves the tag alone changed no source this graph reads. */
      const watcher = watchSource(SRC, () =>
        match(stampOf(SRC) === generation)
          .with(true, nothing)
          .with(false, reload)
          .exhaustive()
      )

      io.shutdown.subscribe({ complete: () => watcher.stop() })
    })
    .exhaustive()
}
