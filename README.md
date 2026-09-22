# omp-blips

An [oh-my-pi](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent) extension that turns
the assistant's token stream into sound: one short pitched blip every few streamed characters,
with the pitch derived from the character itself.

## How it works

- `message_update` carries an `assistantMessageEvent`; only `text_delta` (and optionally
  `thinking_delta`) contribute characters.
- Every `charsPerBlip`-th character is mapped to a scale degree (`src/pitch.ts`): letters ascend
  alphabetically, digits continue above them, everything else is silent so the rhythm follows words.
- The degree is resolved against a major pentatonic scale spread over N octaves, so any text stays
  consonant.
- Tones are rendered once per frequency as 16-bit mono WAVs in `$TMPDIR/omp-blips` (`src/tone.ts`)
  and played with macOS `afplay` (`src/player.ts`). No native audio bindings.
- A rate limit (`minIntervalMs`) and a concurrency cap keep fast streams from stacking processes.

## Install

```sh
mise run link      # symlinks the repo into ~/.omp/agent/extensions/omp-blips
```

Restart `omp`. Use `/blips`, `/blips on`, `/blips off` to toggle it at runtime.

## Development

```sh
mise run typecheck
mise run demo -- "the quick brown fox"   # plays a phrase through the real pipeline
```

## Tuning

All knobs live in `src/config.ts`: `charsPerBlip`, `minIntervalMs`, `toneMs`, `volume`,
`baseFrequency`, `scale`, `octaves`, `thinking`.

## Platform

macOS only — playback goes through `afplay`.
