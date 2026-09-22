export interface Player {
  /** Play a tone. Never throws. */
  readonly play: (frequency: number) => void
  /** Stop everything and release any audio process. */
  readonly dispose: () => void
}
