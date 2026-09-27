import {
  distinctUntilChanged,
  EMPTY,
  type Observable,
  share,
  switchMap
} from 'rxjs'
import { match } from 'ts-pattern'
import { ffplay } from './players/ffplay.ts'
import type { PlayCommand } from './players/types.ts'

export { flush, play } from './players/types.ts'
export type { Backend, PlayCommand, Tone } from './players/types.ts'

export interface Device {
  /** Every voice is off: hold no process at all. */
  readonly muted: boolean
}

const sameDevice = (left: Device, right: Device): boolean =>
  left.muted === right.muted

/**
 * The commands are made hot here: a backend may subscribe to them more than
 * once, and a device change must not replay the tones of the previous one.
 * The binary is only asked for once a device is wanted.
 */
export const playback = (
  devices: Observable<Device>,
  commands: Observable<PlayCommand>,
  binary: Observable<string>
): Observable<never> => {
  const live = commands.pipe(
    share({
      resetOnRefCountZero: false,
      resetOnComplete: false,
      resetOnError: false
    })
  )

  return devices.pipe(
    distinctUntilChanged(sameDevice),
    switchMap((device) =>
      match(device.muted)
        .with(true, () => EMPTY)
        .with(false, () =>
          binary.pipe(switchMap((path) => ffplay({ path })(live)))
        )
        .exhaustive()
    )
  )
}
