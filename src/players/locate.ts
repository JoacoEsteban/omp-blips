import { createHash } from 'node:crypto'
import { chmod, mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import {
  concat,
  defer,
  filter,
  from,
  map,
  type Observable,
  of,
  ReplaySubject,
  share,
  switchMap,
  throwError
} from 'rxjs'
import { match, P } from 'ts-pattern'

export type Located =
  | { readonly type: 'fetching'; readonly url: string }
  | { readonly type: 'ready'; readonly path: string; readonly fetched: boolean }

interface Build {
  readonly url: string
  readonly sha256: string
}

const RELEASE = '9.0.2'

/**
 * Static builds from ffmpeg.martin-riedl.de, the one host that ships ffplay for
 * both macOS and Linux; the npm ffmpeg-static packages leave ffplay out. The
 * macOS zips are signed, so the extracted binary runs without a quarantine
 * prompt. Each zip holds a single deflated `ffplay` entry.
 */
const BUILDS: Readonly<Record<string, Build>> = {
  'darwin-arm64': {
    url: 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffplay.zip',
    sha256: '68e4bbec42ff060af82edb6406e04d9492920f98ff14cf0ef0a7ed70760acae8'
  },
  'darwin-x64': {
    url: 'https://ffmpeg.martin-riedl.de/download/macos/amd64/1789931006_9.0.2/ffplay.zip',
    sha256: '8c64d2bbd884e533f25e30aacff3f637cd298213a083ef900de667fa91e22ada'
  },
  'linux-x64': {
    url: 'https://ffmpeg.martin-riedl.de/download/linux/amd64/1789931100_9.0.2/ffplay.zip',
    sha256: 'a832bfe6ddff3a7e5ece8b785e3887c791bf3a36463901c009733ee8e896312d'
  },
  'linux-arm64': {
    url: 'https://ffmpeg.martin-riedl.de/download/linux/arm64/1789931697_9.0.2/ffplay.zip',
    sha256: '1c4728fdf0e3a6ec82f0050cc9a163386f90470a25aa90898ddfd6a6b0df5445'
  }
}

const PLATFORM = `${process.platform}-${process.arch}`

/** ZIP local file header layout, APPNOTE 4.3.7. */
const LOCAL_HEADER_SIGNATURE = 0x04034b50
const DATA_DESCRIPTOR_FLAG = 0x08
const DEFLATE = 8
const LOCAL_HEADER_BYTES = 30

const cacheRoot = (): string =>
  match(process.platform)
    .with('darwin', () => join(homedir(), 'Library', 'Caches'))
    .otherwise(() => process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'))

const CACHED = join(cacheRoot(), 'omp-blips', `ffplay-${RELEASE}`)

const existing = (path: string): Promise<string | undefined> =>
  stat(path).then(
    () => path,
    () => undefined
  )

const sha256Of = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex')

const soleEntry = (zip: Buffer): Buffer => {
  const compressed = zip.readUInt32LE(18)
  const uncompressed = zip.readUInt32LE(22)
  const start = LOCAL_HEADER_BYTES + zip.readUInt16LE(26) + zip.readUInt16LE(28)

  return match({
    signature: zip.readUInt32LE(0),
    descriptor: zip.readUInt16LE(6) & DATA_DESCRIPTOR_FLAG,
    method: zip.readUInt16LE(8)
  })
    .with(
      { signature: LOCAL_HEADER_SIGNATURE, descriptor: 0, method: DEFLATE },
      () => {
        const entry = inflateRawSync(zip.subarray(start, start + compressed))
        return match(entry.length)
          .with(uncompressed, () => entry)
          .otherwise((length) => {
            throw new Error(
              `ffplay archive inflated to ${length} bytes, not ${uncompressed}`
            )
          })
      }
    )
    .otherwise(() => {
      throw new Error('ffplay archive is not a single deflated entry')
    })
}

/**
 * An `ffplay` on the PATH wins, so a system install keeps its codecs and
 * updates. Otherwise the pinned build is fetched once into the user cache,
 * outside any omp profile or plugin directory, so upgrades keep it.
 */
export class FfplayLocator {
  /**
   * One lookup per locator, replayed whole: a late subscriber still sees a
   * download that began before it, and a failure is not retried.
   */
  readonly located: Observable<Located> = defer(() => this.lookup()).pipe(
    share({
      connector: () => new ReplaySubject<Located>(),
      resetOnError: false,
      resetOnComplete: false,
      resetOnRefCountZero: false
    })
  )

  readonly path: Observable<string> = this.located.pipe(
    filter(
      (event): event is Extract<Located, { type: 'ready' }> =>
        event.type === 'ready'
    ),
    map(({ path }) => path)
  )

  private lookup(): Observable<Located> {
    return match(Bun.which('ffplay'))
      .with(P.string, (path) =>
        of<Located>({ type: 'ready', path, fetched: false })
      )
      .otherwise(() =>
        from(existing(CACHED)).pipe(
          switchMap((cached) =>
            match(cached)
              .with(P.string, (path) =>
                of<Located>({ type: 'ready', path, fetched: false })
              )
              .otherwise(() => this.fetched())
          )
        )
      )
  }

  private fetched(): Observable<Located> {
    return match(BUILDS[PLATFORM])
      .with(P.nullish, () =>
        throwError(
          () => new Error(`no ffplay build for ${PLATFORM}, install ffmpeg`)
        )
      )
      .otherwise((build) =>
        concat(
          of<Located>({ type: 'fetching', url: build.url }),
          defer(() => this.download(build)).pipe(
            map((path): Located => ({ type: 'ready', path, fetched: true }))
          )
        )
      )
  }

  private async download({ url, sha256 }: Build): Promise<string> {
    const response = await fetch(url)
    const zip = await match(response)
      .with({ ok: true }, (ok) =>
        ok.arrayBuffer().then((body) => Buffer.from(body))
      )
      .otherwise(({ status }) =>
        Promise.reject(new Error(`${url} answered ${status}`))
      )

    const binary = match(sha256Of(zip))
      .with(sha256, () => soleEntry(zip))
      .otherwise((actual) => {
        throw new Error(`${url} hashed to ${actual}, pinned ${sha256}`)
      })

    // Written aside and renamed so an interrupted download never looks cached.
    const partial = `${CACHED}.${process.pid}.partial`
    await mkdir(dirname(CACHED), { recursive: true })
    await writeFile(partial, binary)
    await chmod(partial, 0o755)
    await rename(partial, CACHED)
    return CACHED
  }
}
