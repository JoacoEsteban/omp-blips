# omp-blips

**Hear your agent think.**

omp-blips is an extension for [oh-my-pi](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent). It
turns the output of your coding agent into sound. While the agent writes, it plays short musical tones
called blips. The letters of the text choose the notes, so each answer becomes its own melody.

It sounds like the dialog of a character in a classic video game. The character is your agent.

## Why listen to your agent

A coding agent works for minutes at a time. You look away, and then you look back to see what it
does. With omp-blips, you can know without a look at the screen.

- **Hear what it does.** Each kind of output has its own voice. A melody plays for the answer. A
  dark murmur plays for the reasoning. Bright ticks play while the agent writes tool calls and edits.
- **Hear when it stops.** When the sound stops, the agent is done or waits for you. If you
  interrupt the agent, the blips stop with it. They do not ring on for text that never comes.
- **Hear the whole team.** Subagents and other omp windows play into one shared mix.
- **Choose your sound.** 16 presets go from a quiet background hum to a Geiger counter. You can
  also design your own sound in one JSON file.

## Install

```sh
omp plugin install omp-blips
```

Start `omp` again. The blips start with the next answer.

omp-blips plays audio through `ffplay`. If `ffplay` is not on your `PATH`, the extension downloads
it one time. The download is approximately 29 MB, and the extension compares it with a pinned
checksum. The extension runs on macOS and Linux.

## Find your sound

Run `/blips preset`. A picker opens in the terminal. The preset under the cursor plays at once,
on a sample text that arrives in bursts like a real answer.

| Key          | Action                            |
| ------------ | --------------------------------- |
| ↑ / ↓        | Move to another preset.           |
| ← / → or Tab | Hear another voice.               |
| `r`          | Generate a new sample text.       |
| `[` / `]`    | Make the stream slower or faster. |
| Space        | Pause or continue.                |
| Enter        | Keep this preset.                 |
| Esc or `q`   | Leave without a change.           |

The preset that you keep stays active in the next sessions too.

## Presets

| Preset       | Sound                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| `default`    | A melody for the text, a dark murmur for the reasoning, bright ticks for the tools. |
| `arcade`     | Fast small tones in a high range. A text crawl from a 1988 video game.              |
| `gamelan`    | Struck ceramic and glass. The long tones continue and mix into a haze.              |
| `sonar`      | A submarine. One slow low ping after each few words.                                |
| `typewriter` | Mechanical keys. The pitch changes very little, so you hear rhythm.                 |
| `music-box`  | A wind-up music box. High, sweet, and in small steps.                               |
| `quiet`      | Background sound. Text only, low volume, large spaces between the blips.            |
| `haiku`      | One held note for each word. The melody is the shape of the sentence.               |
| `pulse`      | One beat for each word, on one pitch. The rhythm of the writing, and nothing more.  |
| `plainchant` | Vowels only, held, in one octave. The text sings its spine.                         |
| `cipher`     | One semitone for each letter. You hear a word as it is spelled.                     |
| `telegraph`  | A wire. Each character is one tick, and only the spaces speak.                      |
| `geiger`     | One tick for each character, at any speed the text arrives.                         |
| `hexdump`    | Raw bytes. Punctuation sounds, and the tool calls lead.                             |
| `psychosis`  | Two mouths on every character and a needle over them, none agreeing.                |
| `sans`       | A rising vocal blip. Rounded low tones, one for each character.                     |

## Commands

| Command                | Result                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `/blips`               | Stops all voices. If all voices are off, it starts all voices.  |
| `/blips on`            | Starts all voices.                                              |
| `/blips off`           | Stops all voices.                                               |
| `/blips text`          | Starts or stops the voice for the answer text.                  |
| `/blips thinking`      | Starts or stops the voice for the reasoning.                    |
| `/blips tool`          | Starts or stops the voice for the tool arguments.               |
| `/blips presets`       | Shows the list of presets.                                      |
| `/blips preset`        | Opens the preset picker.                                        |
| `/blips preset <name>` | Selects this preset.                                            |
| `/blips reload`        | Reads the configuration file again. A restart is not necessary. |
| `/blips where`         | Shows the path of the configuration file.                       |

Type `/blips ` to see each subcommand with its description.

## Make it your own

A preset is only the start. The file `~/.omp/agent/blips.json` can change any part of it: the
material of a voice, its scale, its volume, and its position in stereo.

```json
{
  "preset": "gamelan",
  "voices": {
    "thinking": { "material": "wood", "volume": 0.4 },
    "tool": { "enabled": false }
  }
}
```

Run `/blips reload` to hear the change. If the file has an error, the extension shows the reason
and keeps the previous sound. For every key and every option, refer to
[Sound design](docs/sound.md).

## How it works

- **The text is the score.** By default, each letter is a note on a pentatonic scale. Spaces are
  silent, so the rhythm follows the words.
- **The tempo is steady.** One shared clock sets the rhythm of all voices. When the model writes
  faster, each blip stands for more text. The tempo does not change.
- **Every tone is synthesized.** A modal synthesizer renders each tone at runtime. It imitates
  struck and sustained materials: wood, stone, ceramic, glass, reed, brass, and a voice. The
  extension contains no audio files.
- **One mix for all sessions.** A background process mixes the tones of every omp session and
  plays them through one audio device.

For the full design, refer to [Internals](docs/internals.md).

## Development

Run `mise run link` to load your checkout as the omp extension. When you save a file under `src/`,
the extension reloads it. You hear the change on the next blip.

| Command              | Function                                  |
| -------------------- | ----------------------------------------- |
| `mise run test`      | Runs the unit tests.                      |
| `mise run typecheck` | Examines the types with `tsc`.            |
| `mise run lint`      | Examines the source files with ESLint.    |
| `mise run audition`  | Plays the same text through every preset. |
| `mise run unlink`    | Removes the link.                         |

To release, run `npm version`. It pushes the new tag, and the tag starts the `Release` workflow.
The workflow runs the checks and publishes the package to npm.

## License

[MIT](LICENSE)
