import { existsSync, readdirSync, statSync, watch } from 'node:fs'
import { join } from 'node:path'
import { match } from 'ts-pattern'

/** An editor saves in a burst — a write, a rename — and this collapses them into one reload. */
const SETTLE_MS = 150

const nothing = (): undefined => undefined

/**
 * Newest mtime under `root`, whole milliseconds.
 *
 * This is the tag a re-import of the graph carries. omp loads every module of
 * an extension through one `onLoad` hook whose filter is the set of known
 * paths followed by an optional `?mtime=<digits>`, and rewrites the source it
 * hands back: bare dependencies resolve against the extension, and relative
 * imports inherit the tag their importer arrived with. So tagging the graph
 * root is enough to re-evaluate everything below it, and the tag MUST be whole
 * digits — a fractional one does not match that filter, the rewrite is skipped,
 * and the graph fails to load on its first bare import.
 *
 * Untouched source answers the tag already loaded, so re-importing it costs
 * nothing; one edit anywhere moves the whole graph to a new generation.
 */
export const stampOf = (root: string): string =>
  String(
    Math.round(
      readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((entry) => entry.endsWith('.ts'))
        .reduce(
          (newest, entry) =>
            Math.max(newest, statSync(join(root, entry)).mtimeMs),
          0
        )
    )
  )

/**
 * A working checkout rather than an installed copy. Only there does rebuilding
 * the graph on every save earn the interruption.
 */
export const developing = (root: string): boolean =>
  ['.jj', '.git'].some((marker) => existsSync(join(root, marker)))

export interface Watch {
  readonly stop: () => void
}

export const watchSource = (root: string, changed: () => void): Watch => {
  let settle: NodeJS.Timeout | undefined

  const watcher = watch(
    root,
    { recursive: true, encoding: 'utf8' },
    (_event, filename) =>
      match(filename?.endsWith('.ts') ?? false)
        .with(false, nothing)
        .with(true, () => {
          clearTimeout(settle)
          settle = setTimeout(changed, SETTLE_MS)
        })
        .exhaustive()
  )

  return {
    stop: () => {
      clearTimeout(settle)
      watcher.close()
    }
  }
}
