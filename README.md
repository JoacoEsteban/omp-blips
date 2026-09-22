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
- Tones are synthesized once per frequency (`src/synth.ts`) and handed to a playback backend.
- A rate limit (`minIntervalMs`) keeps fast streams from stacking tones.

## Backends

Set `backend` in `src/config.ts`.

- **`ffplay`** (default, `src/players/ffplay.ts`) — one long-lived `ffplay` reading raw PCM from
  stdin. A 10 ms mixer tick writes a continuous real-time stream, 40 ms ahead of the wall clock, so
  a tone starts on the next tick instead of waiting for a process spawn, and overlapping tones are
  summed into one buffer instead of racing processes. The sink shuts down after 20 s of silence and
  respawns on the next blip. Needs `ffmpeg` installed.
- **`afplay`** (`src/players/afplay.ts`) — macOS built-in, one short-lived process per tone against
  a cached WAV in `$TMPDIR/omp-blips`. Zero dependencies, ~50 ms spawn latency, capped at 6
  concurrent processes.

## Install

```sh
mise run link      # symlinks the repo into ~/.omp/agent/extensions/omp-blips
```

Restart `omp`. Use `/blips`, `/blips on`, `/blips off` to toggle it at runtime.

## Development

```sh
mise run typecheck
mise run demo -- "the quick brown fox" ffplay   # real pipeline, backend of your choice
```

## Tuning

All knobs live in `src/config.ts`: `backend`, `charsPerBlip`, `minIntervalMs`, `toneMs`, `volume`,
`baseFrequency`, `scale`, `octaves`, `thinking`.

## Platform

macOS only — both backends assume it (`afplay` is built in, `ffplay` uses the default CoreAudio
output).
