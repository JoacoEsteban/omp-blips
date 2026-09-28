import {
  distinctUntilChanged,
  map,
  type Observable,
  of,
  share,
  switchMap
} from 'rxjs'
import { match } from 'ts-pattern'
import { ffplay } from './players/ffplay.ts'
import { flush, type PlayCommand, type Sent } from './players/types.ts'

export { flush, play } from './players/types.ts'
export type { Backend, PlayCommand, Sent, Tone } from './players/types.ts'

export interface Device {
  /** Every voice is off: send nothing, and release what still rings. */
  readonly muted: boolean
}

const sameDevice = (left: Device, right: Device): boolean =>
  left.muted === right.muted

export const hot = <T>(source: Observable<T>): Observable<T> =>
  source.pipe(
    share({
      resetOnRefCountZero: false,
      resetOnComplete: false,
      resetOnError: false
    })
  )

/**
 * The commands a session lets through: all of them while it has a voice, and a
 * single flush when it mutes. They are made hot here so unmuting does not
 * replay the tones of before.
 */
export const gated = (
  devices: Observable<Device>,
  commands: Observable<PlayCommand>
): Observable<PlayCommand> => {
  const live = hot(commands)

  return devices.pipe(
    distinctUntilChanged(sameDevice),
    switchMap((device) =>
      match(device.muted)
        .with(true, () => of(flush()))
        .with(false, () => live)
        .exhaustive()
    )
  )
}

/** One device for every sender. The binary is only asked for once a sender subscribes. */
export const played = (
  sent: Observable<Sent>,
  binary: Observable<string>
): Observable<never> => {
  const live = hot(sent)
  return binary.pipe(switchMap((path) => ffplay({ path })(live)))
}

/** A device of its own, for a process that is the only sender. */
export const playback = (
  commands: Observable<PlayCommand>,
  binary: Observable<string>
): Observable<never> =>
  played(commands.pipe(map((command) => ({ ...command, sender: 0 }))), binary)
