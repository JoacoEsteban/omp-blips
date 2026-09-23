import {
  distinctUntilChanged,
  EMPTY,
  type Observable,
  share,
  switchMap
} from 'rxjs'
import { match } from 'ts-pattern'
import type { BackendName } from './config.ts'
import { afplay } from './players/afplay.ts'
import { ffplay } from './players/ffplay.ts'
import type { Backend, PlayCommand } from './players/types.ts'

export { flush, play } from './players/types.ts'
export type { Backend, PlayCommand, Tone } from './players/types.ts'

/** Which device should be open, and whether anything may sound through it. */
export interface Device {
  readonly backend: BackendName
  /** Every voice is off: hold no process at all. */
  readonly muted: boolean
}

const backendFor = (name: BackendName): Backend =>
  match(name)
    .with('ffplay', () => ffplay())
    .with('afplay', () => afplay())
    .exhaustive()

const sameDevice = (left: Device, right: Device): boolean =>
  left.backend === right.backend && left.muted === right.muted

/**
 * Audio as one observable. The open device follows `devices`, so a backend
 * change or a full mute closes the running process and the next state opens
 * what it asks for. Unsubscribing releases everything.
 *
 * The commands are made hot here: a backend may subscribe to them more than
 * once, and a device change must not replay the tones of the previous one.
 */
export const playback = (
  devices: Observable<Device>,
  commands: Observable<PlayCommand>
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
        .with(false, () => backendFor(device.backend)(live))
        .exhaustive()
    )
  )
}
