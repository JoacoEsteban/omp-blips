# omp-blips

An [oh-my-pi](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent) extension that turns
the assistant's token stream into sound: one short pitched blip every few streamed characters,
with the pitch derived from the character itself.

## How it works

- `message_update` carries an `assistantMessageEvent`. Three of its variants stream characters and
  each gets its own voice: `text_delta` (prose), `thinking_delta` (reasoning), `toolcall_delta`
  (tool arguments as the model builds them — including file edits).
- Every `charsPerBlip`-th character is mapped to a scale degree (`src/pitch.ts`): letters ascend
  alphabetically, digits continue above them, everything else is silent so the rhythm follows words.
- The degree is resolved against a pentatonic scale spread over N octaves, so any text stays
  consonant.
- Tones are synthesized once per frequency (`src/synth.ts`) and handed to a playback backend.
- A rate limit (`minIntervalMs`) keeps fast streams from stacking tones.

## Voices

| Stream | Register | Scale | Mapping | Character |
|---|---|---|---|---|
| `text` | 220 Hz, 3 octaves | major pentatonic | `wrap` | the melody you follow |
| `thinking` | 147 Hz, 2 octaves | minor pentatonic | `fold` | a darker murmur below the prose |
| `tool` | 523 Hz, 2 octaves | major pentatonic | `wrap` | short bright ticks, sparser (dense JSON) |

Per-voice `enabled`, `charsPerBlip`, `toneMs` and `volume` live in `src/config.ts`.

## Mappings

A mapping decides how a character's alphabet index lands on the scale slots a voice has
(`scale.length * octaves`). Presets live in `src/mapping.ts` and are selected per voice by name;
adding one is a function plus an entry in `mappings`.

- **`wrap`** — modulo. Pitch is monotonic in the alphabet, but the wrap point is a cliff: with 15
  slots, `o` sits at the top and `p` drops two octaves. English puts common bigrams (`on`, `or`,
  `no`) right across that seam, so the line leaps. Machine-like, and the default for prose.
- **`fold`** — zigzag: ascend to the top slot, then descend, then ascend. Alphabetically adjacent
  letters are always adjacent degrees, so the melody moves in steps with no seam. Smoother and more
  song-like; the default for reasoning.

Compare them by ear:

```sh
mise run demo -- "no one opposes open protocols" text ffplay wrap
mise run demo -- "no one opposes open protocols" text ffplay fold
```

## Backends

Set `backend` in `src/config.ts`.

- **`ffplay`** (default, `src/players/ffplay.ts`) — one long-lived `ffplay` reading raw PCM from
  stdin. A 10 ms mixer tick writes a continuous real-time stream, 40 ms ahead of the wall clock, so
  a tone starts on the next tick instead of waiting for a process spawn, and overlapping tones are
  summed into one buffer instead of racing processes. A pipe drops nothing, so a stalled event loop
  would push every later blip back forever; the mixer instead skips the starved span — voices age as
  if it had played — trading a gap for staying in sync with the text. The sink shuts down after 20 s
  of silence and respawns on the next blip. Needs `ffmpeg` installed.
- **`afplay`** (`src/players/afplay.ts`) — macOS built-in, one short-lived process per tone against
  a cached WAV in `$TMPDIR/omp-blips`. Zero dependencies, ~50 ms spawn latency, capped at 6
  concurrent processes.

## Install

```sh
mise run link      # symlinks the repo into ~/.omp/agent/extensions/omp-blips
```

Restart `omp`. `/blips` toggles everything; `/blips on|off` forces it; `/blips text`,
`/blips thinking`, `/blips tool` toggle one voice; `/blips reload` re-reads config; `/blips where`
lists the config paths.

## Development

```sh
mise run typecheck
mise run demo -- "the quick brown fox" text ffplay fold   # phrase, voice, backend, mapping
```

## Configuration

Nothing needs editing in `src/`. Drop a `blips.json` in either place — later wins, both optional,
each one overlaid field by field on the defaults:

1. `~/.omp/agent/blips.json` (or `$PI_CODING_AGENT_DIR/blips.json`)
2. `<project>/.omp/blips.json`

```json
{
  "backend": "ffplay",
  "minIntervalMs": 70,
  "voices": {
    "thinking": { "charsPerBlip": 3, "volume": 0.4, "mapping": "fold" },
    "tool": { "enabled": false }
  }
}
```

See `blips.example.json` for every key. Top level: `backend`, `minIntervalMs`. Per voice under
`voices.text` / `voices.thinking` / `voices.tool`: `enabled`, `charsPerBlip`, `toneMs`, `volume`,
`baseFrequency`, `scale`, `octaves`, `mapping`.

The file is schema-validated and unknown keys are rejected, so a typo is reported at session start
instead of silently changing nothing. A bad file is skipped whole rather than half-applied — the
previous settings stay in force. `/blips reload` re-reads without restarting; `/blips where` prints
the paths being checked.

## Platform

macOS only — both backends assume it (`afplay` is built in, `ffplay` uses the default CoreAudio
output).
