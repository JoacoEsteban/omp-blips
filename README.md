# omp-blips

`omp-blips` is an extension for [oh-my-pi](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent).
It makes a short musical tone while the assistant writes. The extension calls each tone a blip.

The pitch of each blip comes from the character that the assistant writes. As a result, you can hear
the work of the agent without a look at the screen.

## How it works

The agent sends a `message_update` event for each small part of the answer. Each event holds an
`assistantMessageEvent`. Three types of this event carry characters:

- `text_delta` holds the answer text.
- `thinking_delta` holds the reasoning of the model.
- `toolcall_delta` holds the arguments of a tool call. File content in an edit is part of these
  arguments.

The extension gives each of the three types a different voice. For each voice, one character in
`charsPerBlip` becomes a blip.

A character becomes a number: `a` is 0, `z` is 25, and the digits continue above the letters. All
other characters are silent. Because space and punctuation are silent, the rhythm of the blips
follows the words of the text.

A mapping turns this number into a position in a musical scale. All scales are pentatonic, so two
blips are never dissonant. The file `src/synth.ts` makes the tone for each frequency one time and
keeps it in memory.

The option `minIntervalMs` sets the minimum time between two blips. A fast stream loses blips and
does not become a mass of sound.

## Presets

A preset is a complete set of values for the three voices. The file `src/presets.ts` holds the
presets. The default preset has the name `default`.

| Preset | Sound |
|---|---|
| `default` | A melody for the text, a dark murmur for the reasoning, bright ticks for the tools. |
| `arcade` | Fast small tones in a high range. A text crawl from a 1988 video game. |
| `gamelan` | Struck metal. The long tones continue and mix into a haze. |
| `sonar` | A submarine. One slow low ping after each few words. |
| `typewriter` | Mechanical keys. The pitch changes very little, so you hear rhythm. |
| `music-box` | A wind-up music box. High, sweet, and in small steps. |
| `quiet` | Background sound. Text only, low volume, large spaces between the blips. |

To hear all presets one after the other, run `mise run audition`.

To select a preset, write its name in a configuration file:

```json
{ "preset": "gamelan" }
```

A configuration file can also change single values of the preset. The extension applies the preset
first, then the file.

To try a preset in a session, run `/blips preset gamelan`. This selection stays until the session
ends. To see the list of names, run `/blips presets`.

## Voices

These values are the values of the preset `default`. Another preset gives other values.

| Stream | Lowest pitch | Range | Scale | Mapping | Sound |
|---|---|---|---|---|---|
| `text` | 220 Hz | 3 octaves | major pentatonic | `wrap` | the melody that you follow |
| `thinking` | 147 Hz | 2 octaves | minor pentatonic | `fold` | a dark murmur below the text |
| `tool` | 523 Hz | 2 octaves | major pentatonic | `wrap` | short bright ticks |

The `tool` voice makes fewer blips than the other two voices. Tool arguments are JSON and contain
many characters.

## Scales

The file `src/scales.ts` holds the scales. Each scale has five or six notes in one octave. Two
notes that are one semitone apart are not in the same scale. As a result, two blips are never
dissonant.

| Scale | Sound |
|---|---|
| `MAJOR_PENTATONIC` | Bright and neutral. |
| `MINOR_PENTATONIC` | The same shape, but darker. |
| `HIRAJOSHI` | Japanese. Metallic, like a bell. |
| `KUMOI` | Softer than hirajoshi. The color of a music box. |
| `BLUES` | Restless. It contains the flat fifth. |

A configuration file gives a scale as an array of semitone numbers. The value `[0, 2, 4, 7, 9]` is
the major pentatonic scale.

## Mappings

A voice has a limited number of positions in its scale. The number is `scale.length * octaves`. A
mapping puts the number of a character into one of these positions. The file `src/mapping.ts` holds
the mappings. Each voice selects one mapping by name.

`wrap` is the remainder after a division. The pitch goes up with the alphabet, but there is a large
step at the end of the range. With 15 positions, `o` is the highest pitch and `p` is more than two
octaves lower. Frequent English letter pairs such as `on`, `or` and `no` cross this point. As a
result, the melody makes large jumps and sounds mechanical.

`fold` goes up to the highest position, then down again, then up again. Two letters that are
together in the alphabet always get two positions that are together in the scale. As a result, the
melody moves in small steps and sounds more like a song.

To compare the two mappings, run these two commands:

```sh
mise run demo -- "no one opposes open protocols" text ffplay wrap
mise run demo -- "no one opposes open protocols" text ffplay fold
```

## Backends

A backend sends the tones to the audio device. The option `backend` selects one of two backends.

### ffplay

`ffplay` is the default backend. The code is in `src/players/ffplay.ts`. This backend needs an
installation of `ffmpeg`.

The extension starts one `ffplay` process and keeps it. The process reads raw PCM audio from its
standard input. A mixer writes new audio each 10 ms and stays 40 ms in front of the clock.

This design has two results. A tone starts at the next mixer step and does not wait for a new
process. Two tones that occur together become one mixed sound.

A pipe does not discard data. If the event loop stops for more than 40 ms, all later blips move
back in time and stay late. To prevent this delay, the mixer discards the audio of the interval that
it missed. The tones become older as if the audio had played. As a result, the sound stays
synchronous with the text, but there is a short gap.

After 20 s without a blip, the extension stops the process. The next blip starts a new process.

### afplay

`afplay` is part of macOS. The code is in `src/players/afplay.ts`. This backend needs no
installation.

The extension starts one short process for each blip. It plays a WAV file from the cache directory
`$TMPDIR/omp-blips`. A new process needs approximately 50 ms before the sound starts. A maximum of
6 processes can play at the same time.

## Install

1. Run `mise run link`. This command makes a symbolic link in `~/.omp/agent/extensions/omp-blips`.
2. Start `omp` again. The extension loads at the start of a session.

To remove the symbolic link, run `mise run unlink`.

## Commands

| Command | Result |
|---|---|
| `/blips` | Stops all voices. If all voices are off, it starts all voices. |
| `/blips on` | Starts all voices. |
| `/blips off` | Stops all voices. |
| `/blips text` | Starts or stops the voice for the answer text. |
| `/blips thinking` | Starts or stops the voice for the reasoning. |
| `/blips tool` | Starts or stops the voice for the tool arguments. |
| `/blips presets` | Shows the list of presets. |
| `/blips preset <name>` | Uses this preset until the session ends. |
| `/blips reload` | Reads the configuration files again. A restart is not necessary. |
| `/blips where` | Shows the paths of the configuration files. |

## Configuration

A change to the sound does not need a change to the code in `src/`. Write a file with the name
`blips.json` in one of these two locations:

1. `~/.omp/agent/blips.json`, or `$PI_CODING_AGENT_DIR/blips.json` for a different profile.
2. `<project>/.omp/blips.json`.

The two files are optional. The extension starts with the default values. Then it applies the
preset, then the first file, then the second file. A file gives only the keys that it changes.

```json
{
  "preset": "gamelan",
  "backend": "ffplay",
  "minIntervalMs": 70,
  "voices": {
    "thinking": { "charsPerBlip": 3, "volume": 0.4, "mapping": "fold" },
    "tool": { "enabled": false }
  }
}
```

### Keys

| Key | Type | Function |
|---|---|---|
| `backend` | `"ffplay"` or `"afplay"` | The backend that plays the tones. |
| `preset` | a preset name | The preset that gives the start values. |
| `minIntervalMs` | number | The minimum time in milliseconds between two blips. |

Each voice under `voices.text`, `voices.thinking` and `voices.tool` accepts these keys:

| Key | Type | Function |
|---|---|---|
| `enabled` | boolean | Starts this voice at the start of a session. |
| `charsPerBlip` | integer | The number of characters for one blip. |
| `toneMs` | number | The length of one tone in milliseconds. |
| `volume` | number from 0 to 1 | The loudness of this voice. |
| `baseFrequency` | number | The frequency in Hz of the lowest position in the scale. |
| `scale` | array of numbers | The semitone positions of one octave of the scale. |
| `octaves` | integer | The number of octaves for the range of characters. |
| `mapping` | `"wrap"` or `"fold"` | The mapping from a character to a position in the scale. |

The file `blips.example.json` shows all keys with their default values.

### Errors in a configuration file

The extension examines the file against a schema. An unknown key is an error. As a result, an error
in the spelling of a key is visible and does not stay silent.

If a file has an error, the extension discards the full file and shows the reason. The values from
before stay in use. The extension never stops the session because of a configuration file.

## Development

| Command | Function |
|---|---|
| `mise run typecheck` | Examines the types with `tsc`. |
| `mise run demo` | Plays a text through the pitch code and the backend. |
| `mise run audition` | Plays the same text through every preset. |

The demo command accepts five arguments: the text, the voice, the backend, the mapping, and the
preset. Each argument after the text is optional.

```sh
mise run demo -- "the quick brown fox" text ffplay fold gamelan
```

The demo reads the same configuration files as the extension. As a result, the demo sounds like the
extension in that directory.

## Platform

The extension operates on macOS only. `afplay` is part of macOS. `ffplay` uses the default audio
output of the system.
