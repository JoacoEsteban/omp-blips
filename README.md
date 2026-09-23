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

The extension gives each of the three types a different voice. Each voice has a reading and a
pitch. The reading consumes the characters and decides which ones make a blip. The pitch turns the
number from the reading into a frequency.

The reading also holds the rate. A reading that samples characters has an `every` value: it makes
one blip for each `every` sounded characters, and a silent character costs nothing. As a result the
rate stays the same in prose and in dense tool arguments. A reading that follows the structure of
the text has no `every` value, because the text gives it the rate.

The default reading is `alphabet`: `a` is 0, `z` is 25, and the digits continue above the letters.
All other characters are silent. Because space and punctuation are silent, the rhythm of the blips
follows the words of the text.

The default pitch is `scalar`. It puts the number in a musical scale of five or six notes per
octave. A pentatonic scale avoids many close semitone steps. Modal resonances add inharmonic
partials, so simultaneous blips can have tension.

The modal synthesizer combines several resonant modes for each material. It adds a short filtered-noise attack.

The synthesizer renders each sound as mono PCM. It keeps rendered sounds in memory. The `afplay` backend also writes each sound to a WAV file cache.

## Streams

The extension is one observable graph. RxJS holds the parts together, and each part is a function of
its input.

`src/events.ts` is the only file that speaks to the host. It makes a stream from each callback: the
start of a session, the deltas of the assistant, the end of a message, the shutdown, and each
`/blips` call.

The state of a session is a fold over those streams. `src/session.ts` holds the reducer. It takes a
session and an event, and it returns the next session. It changes nothing in place.
`src/commands.ts` holds the one step that reads from disk: `reload`, `preset`, and `where` read the
configuration files. What they read becomes the event that the reducer gets.

`src/stream.ts` makes blips from the deltas. It groups the chunks by stream kind, so each voice
counts its own characters. One fold for each group counts the sounded characters and makes the tone.
A pace operator then drops the tones that come inside `minIntervalMs`.

`src/player.ts` maps the session to one device. A different backend, or a mute of all three voices,
closes the process that runs. The next state opens the device that it asks for.

`src/players/mixer.ts` is the mix as a fold. Play, flush, and clock events go in, and blocks of PCM
come out. The state is a value, so the same events always give the same audio.
`src/players/ffplay.ts` writes those blocks to the process.

A subscription starts the audio, and the end of the subscription stops it. The `session_shutdown`
event completes the graph, so no process stays behind.

The scripts use the same pipeline. The sound lab keeps a pure model-and-commands loop for the
display, and it puts every effect in the graph.

## Modal synthesis

Each stream selects a material and a touch. The first four materials are struck objects: their
partials are inharmonic and they decay from one impulse. Material names evoke familiar objects, but
they do not model physical materials. The last two are sustained, and they are built differently:
a harmonic source at the pitch, read through three resonances fixed in Hz. That is the structure of
a voice, and a struck object cannot imitate it however long its tone is held. Touch settings change
the attack, upper modes, and attack noise.

| Material  | Character                                                       |
| --------- | --------------------------------------------------------------- |
| `wood`    | Few modes with a short decay.                                   |
| `stone`   | Dry low modes with sparse inharmonic upper resonances.          |
| `ceramic` | Bright modes with slight inharmonic spacing.                    |
| `glass`   | Bright upper modes with a long decay.                           |
| `reed`    | Odd harmonics under a low resonance. Hollow, narrow, and dark.  |
| `brass`   | Every harmonic under three resonances. Rounded, low, and vocal. |

| Touch    | Character                                          |
| -------- | -------------------------------------------------- |
| `soft`   | Slow attack, lower upper modes, and quiet noise.   |
| `normal` | Medium attack, balanced upper modes, and noise.    |
| `firm`   | Fast attack, stronger upper modes, and more noise. |

The default uses `ceramic` and `normal` for `text`, `wood` and `soft` for `thinking`, and `glass` and `soft` for `tool`. The settings are deterministic and do not vary between triggers.

Each mode decays at its own rate. Only the last 12 milliseconds of a tone get a fade to silence, so
what you hear is the decay of the material. The fade also keeps a click off the end of the buffer.

A sustained material needs an envelope that does not decay. Three fractions of the tone shape it,
and each is a number from 0 to 1.

The `swell` option is the rise. At `swell: 0` the tone starts with the attack of its touch, which
is at most 8 milliseconds. A larger value stretches that rise over the given part of the tone, so
the sound arrives instead of starting.

The `hold` option is the flat body. At `hold: 1` the decay never advances, and only the last 12
milliseconds end the tone. At `hold: 0` the decay starts at once, which is the strike.

The `glide` option bends one tone. The pitch starts the given number of semitones above the
nominal frequency and reaches it at the end of the tone. A `glide` of 0 holds the pitch steady.

The resonances of a sustained material stay where they are when the pitch moves, which is why a
vowel keeps its identity at any pitch. The `color` option decides where the second resonance sits
inside its range: `{ "kind": "fixed", "at": 0.5 }` holds one mouth shape, and
`{ "kind": "vowel", "span": 5 }` puts five shapes in rotation, so neighbouring characters are said
with different mouths. `pitch` and `color` read the same character index and answer different
questions: what note a character is, and what vowel it is said with. A struck material ignores
`color`; it has no tract to move.

The colour is quantised to `span` values on purpose. A separate value for each character index
would render and cache a separate tone for every one of them, and two neighbouring mouth shapes are
not distinguishable anyway.

The synthesizer measures the peak of each rendered sound. A sound above the ceiling is scaled down,
and a sound below it keeps its level. A `soft` touch stays quieter than a `firm` one, and no
material can clip.

The cache key includes the exact frequency, duration, decay, swell, hold, glide, colour, material,
touch, and a sound version. Volume is applied during playback, so it is not part of the key.

Old cache files remain in `$TMPDIR/omp-blips`. New sound keys prevent reuse of old fixed-synth files.

The `minIntervalMs` option sets the minimum time between two blips of the same voice. A fast stream
loses blips and does not become a mass of sound. Each voice has its own floor, so a long block of
reasoning does not take the blips of the answer text.

## Interruption

If you stop the agent, the stream ends before the text is complete. The extension then stops the
blips that still sound. It does not let them ring for text that does not come.

The extension finds this condition in two places. The stream sends a terminal `error` event, and the
message ends with the stop reason `aborted` or `error`. Each of the two makes the same stop. A
provider failure has the same effect as a manual stop.

## Presets

A preset is a complete set of values for the three voices. The file `src/presets.ts` holds the
presets. The default preset has the name `default`.

| Preset       | Sound                                                                               | Shows       |
| ------------ | ----------------------------------------------------------------------------------- | ----------- |
| `default`    | A melody for the text, a dark murmur for the reasoning, bright ticks for the tools. | `alphabet`  |
| `arcade`     | Fast small tones in a high range. A text crawl from a 1988 video game.              | `codepoint` |
| `gamelan`    | Struck ceramic and glass. The long tones continue and mix into a haze.              | `phrase`    |
| `sonar`      | A submarine. One slow low ping after each few words.                                | `vowels`    |
| `typewriter` | Mechanical keys. The pitch changes very little, so you hear rhythm.                 | `class`     |
| `music-box`  | A wind-up music box. High, sweet, and in small steps.                               | `phrase`    |
| `quiet`      | Background sound. Text only, low volume, large spaces between the blips.            | `vowels`    |
| `haiku`      | One held note for each word. The melody is the shape of the sentence.               | `phrase`    |
| `pulse`      | One beat for each word, on one pitch. The rhythm of the writing, and nothing more.  | `drone`     |
| `plainchant` | Vowels only, held, in one octave. The text sings its spine.                         | `vowels`    |
| `cipher`     | One semitone for each letter. You hear a word as it is spelled.                     | `chromatic` |
| `telegraph`  | A wire. Each character is one tick, and only the spaces speak.                      | `class`     |
| `hexdump`    | Raw bytes. Punctuation sounds, and the tool calls lead.                             | `codepoint` |
| `sans`       | A deadpan mumble. Rounded low blips, one for each character.                        | `brass`     |

The six presets after `quiet` each show one reading or one pitch with nothing in its way:

- `haiku` gives `phrase` long tones and a low pace floor, so no word is lost.
- `pulse` puts `phrase` against `drone`. The reading keeps the words and the pitch drops the
  melody, so only the rhythm remains.
- `plainchant` keeps `vowels` in one octave. Vowels are the part of a word that a singer holds.
- `cipher` puts `alphabet` against `chromatic` at one blip for each letter. The pitch goes up with
  the alphabet and there is no scale, so `a` is always the same note.
- `telegraph` puts `class` against `drone` at one blip for each character. Only whitespace is
  silent, so the words show as gaps.
- `hexdump` reads the tool arguments character by character. It is the one preset in which the
  tool voice leads.

`sans` uses a sustained material for a low character voice. Each text blip lasts 115 milliseconds
at 164.81 Hz. It rises across its first 15%, holds until its midpoint, then fades.
The character interval remains 66 milliseconds, independent of the blip duration.
One fixed vowel colour gives each character the same mouth shape.
The reasoning voice uses the same envelope and a fixed colour on the narrower `reed`,
at 123.47 Hz and half the character rate. The tool voice remains a short stone knock.

The text voice approximates `voice_sans.mp3`, which contains about 115 milliseconds of audible
sound. The reference has a fundamental near 165 Hz and its strongest spectral peak near 330 Hz.
The `brass` resonances emphasize this second harmonic, with weaker upper resonances near
1340 Hz and 2800 Hz. The synthesized pitch stays fixed rather than reproducing the recording's
small pitch changes. Every partial comes from the synthesis formula, not sampled audio.

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

| Stream     | Lowest pitch | Reading             | Pitch                                       | Material | Touch  | Sound                        |
| ---------- | ------------ | ------------------- | ------------------------------------------- | -------- | ------ | ---------------------------- |
| `text`     | 220 Hz       | `alphabet`, every 3 | scalar, major pentatonic, 3 octaves, `wrap` | ceramic  | normal | the melody that you follow   |
| `thinking` | 147 Hz       | `alphabet`, every 4 | scalar, minor pentatonic, 2 octaves, `fold` | wood     | soft   | a dark murmur below the text |
| `tool`     | 523 Hz       | `alphabet`, every 6 | scalar, major pentatonic, 2 octaves, `wrap` | glass    | soft   | short bright ticks           |

The `tool` voice makes fewer blips than the other two voices. Tool arguments are JSON and contain
many characters.

Each voice selects its own reading and its own pitch. The preset `gamelan` shows why: the two prose
voices read phrases, and the `tool` voice plays one pitch for dense JSON.

## Readings

A reading consumes the characters of a stream. It turns a character into a number, it makes the
character silent, or it waits for more characters. The file `src/reading.ts` holds the readings. A
reading is a cursor: it reads one character and returns the reading that continues after it. A
reading with memory keeps its state inside that cursor.

Each reading holds its own rate. This is the reason that a voice has no global counter: a counter
outside the reading lands on an arbitrary character of each word, and the shape that the reading
builds does not reach your ear.

| Reading     | Behavior                                                                      | Rate         |
| ----------- | ----------------------------------------------------------------------------- | ------------ |
| `alphabet`  | Letters, then digits. All other characters are silent.                        | `every`      |
| `codepoint` | Each visible character, after a division by `span`. Punctuation sounds too.   | `every`      |
| `class`     | Four numbers: vowel, consonant, digit, punctuation. Whitespace is silent.     | `every`      |
| `vowels`    | Vowels only, by their position in `aeiou`. The text becomes much more sparse. | `every`      |
| `phrase`    | One blip for each word. The length of a word moves the pitch of the next one. | one per word |

`every` is a number of sounded characters for one blip. A silent character costs nothing.

`phrase` has memory and no `every` value. It makes one blip at the start of each word. The length
of that word then moves the floor of the next word, and the floor returns to zero after a full
stop, a question mark or an exclamation mark.

The text moves the pitch, and not a counter. A counter adds the same value after each word, which
gives a scale run or a short figure that repeats. Word lengths are different, so a short word makes
a small move and a long word makes a large one. Two sentences with the same number of words do not
sound the same.

As a result, the melody is the shape of the sentence, and the silence between two blips is the
length of a word.

A configuration file gives a reading as an object with a `kind`:

```json
{ "voices": { "text": { "reading": { "kind": "phrase", "span": 4 } } } }
```

The `span` of `phrase` is the number of degrees that the floor moves through before it starts
again. The `span` of `codepoint` is the number of different values that it gives.

## Pitches

A pitch turns the number from the reading into a frequency. The file `src/pitch.ts` holds the
pitches. Each pitch uses `baseFrequency` as its reference. `baseFrequency` stays on the voice,
because each pitch needs it.

| Pitch       | Behavior                                                                             |
| ----------- | ------------------------------------------------------------------------------------ |
| `scalar`    | The number becomes a position in a scale. It needs `scale`, `octaves` and `mapping`. |
| `drone`     | One frequency for each character. There is no melody.                                |
| `chromatic` | Semitone steps, after a division by `span`. There is no scale.                       |

A configuration file gives a pitch as an object with a `kind`:

```json
{
  "voices": {
    "tool": { "pitch": { "kind": "chromatic", "span": 7 } }
  }
}
```

A file replaces the full `reading` object and the full `pitch` object. It does not merge the parts.
A half `scalar` pitch and a half `drone` pitch is not a voice.

## Scales

The file `src/scales.ts` holds the scales. Each scale has five or six notes in one octave.

Pentatonic scales avoid many close semitone steps. Modal partials can still add inharmonic intervals.

| Scale              | Sound                                            |
| ------------------ | ------------------------------------------------ |
| `MAJOR_PENTATONIC` | Bright and neutral.                              |
| `MINOR_PENTATONIC` | The same shape, but darker.                      |
| `HIRAJOSHI`        | Japanese. Metallic, like a bell.                 |
| `KUMOI`            | Softer than hirajoshi. The color of a music box. |
| `BLUES`            | Restless. It contains the flat fifth.            |

A configuration file gives a scale as an array of semitone numbers. The value `[0, 2, 4, 7, 9]` is
the major pentatonic scale.

## Mappings

A `scalar` pitch has a limited number of positions in its scale. The number is
`scale.length * octaves`. A mapping puts the number of a character into one of these positions. The
file `src/mapping.ts` holds the mappings. Each `scalar` pitch selects one mapping by name.

`wrap` is the remainder after a division. The pitch goes up with the alphabet, but there is a large
step at the end of the range. With 15 positions, `o` is the highest pitch and `p` is more than two
octaves lower. Frequent English letter pairs such as `on`, `or` and `no` cross this point. As a
result, the melody makes large jumps and sounds mechanical.

`fold` goes up to the highest position, then down again, then up again. Two letters that are
together in the alphabet always get two positions that are together in the scale. As a result, the
melody moves in small steps and sounds more like a song.

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

A stop decreases the sound to zero in 6 ms. A tone that stops in one step makes a click. Up to 40 ms
of audio is already in the pipe and stays there, so the silence starts a moment after the stop.

### afplay

`afplay` is part of macOS. The code is in `src/players/afplay.ts`. This backend needs no
installation.

The extension starts one short process for each blip. It plays a WAV file from the cache directory
`$TMPDIR/omp-blips`. A new process needs approximately 50 ms before the sound starts. A maximum of
6 processes can play at the same time.

A stop kills the processes that play. `afplay` gives no control of the volume during play, so the
sound stops in one step.

## Install

1. Run `mise run link`. This command makes a symbolic link in `~/.omp/agent/extensions/omp-blips`.
2. Start `omp` again. The extension loads at the start of a session.

To remove the symbolic link, run `mise run unlink`.

## Commands

| Command                | Result                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/blips`               | Stops all voices. If all voices are off, it starts all voices.                                                    |
| `/blips on`            | Starts all voices.                                                                                                |
| `/blips off`           | Stops all voices.                                                                                                 |
| `/blips text`          | Starts or stops the voice for the answer text.                                                                    |
| `/blips thinking`      | Starts or stops the voice for the reasoning.                                                                      |
| `/blips tool`          | Starts or stops the voice for the tool arguments.                                                                 |
| `/blips presets`       | Shows the list of presets.                                                                                        |
| `/blips preset <name>` | Uses this preset until the session ends.                                                                          |
| `/blips reload`        | Reads the configuration files again. A restart is not necessary. It keeps the voices that you started or stopped. |
| `/blips where`         | Shows the paths of the configuration files.                                                                       |

The command completes its arguments. Type `/blips ` and the dropdown shows each subcommand with
its description. Type `/blips preset ` and it shows each preset name with its description. An
unknown word shows the usage line instead of a silent change.

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
    "thinking": {
      "volume": 0.4,
      "material": "wood",
      "touch": "soft",
      "reading": { "kind": "vowels" },
      "pitch": { "kind": "drone" }
    },
    "tool": { "enabled": false }
  }
}
```

### Keys

| Key             | Type                     | Function                                                              |
| --------------- | ------------------------ | --------------------------------------------------------------------- |
| `backend`       | `"ffplay"` or `"afplay"` | The backend that plays the tones.                                     |
| `preset`        | a preset name            | The preset that gives the start values.                               |
| `minIntervalMs` | number                   | The minimum time in milliseconds between two blips of the same voice. |

Each voice under `voices.text`, `voices.thinking` and `voices.tool` accepts these keys:

| Key             | Type                                                                | Function                                                        |
| --------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `enabled`       | boolean                                                             | Starts this voice at the start of a session.                    |
| `toneMs`        | number                                                              | The length of one tone in milliseconds.                         |
| `decay`         | positive number                                                     | Multiplies the material's decay rate. Lower values ring longer. |
| `swell`         | number from 0 to 1                                                  | The part of the tone spent rising to full level.                |
| `hold`          | number from 0 to 1                                                  | The part of the tone held at full body before the decay starts. |
| `glide`         | number                                                              | Semitones the pitch falls across one tone. 0 holds it steady.   |
| `volume`        | number from 0 to 1                                                  | The loudness of this voice.                                     |
| `material`      | `"wood"`, `"stone"`, `"ceramic"`, `"glass"`, `"reed"`, or `"brass"` | The resonant material.                                          |
| `color`         | a colour object                                                     | Where the second resonance sits, for a sustained material.      |
| `touch`         | `"soft"`, `"normal"`, or `"firm"`                                   | The attack and upper-mode strength.                             |
| `baseFrequency` | number                                                              | The reference frequency in Hz of this voice.                    |
| `reading`       | a reading object                                                    | How a character becomes a number, or becomes silent.            |
| `pitch`         | a pitch object                                                      | How that number becomes a frequency.                            |

A colour object is either `{ "kind": "fixed", "at": <0 to 1> }` or
`{ "kind": "vowel", "span": <count> }`.

The file `blips.example.json` shows material and touch keys with example values.

### Errors in a configuration file

The extension examines the file against a schema. An unknown key is an error. As a result, an error
in the spelling of a key is visible and does not stay silent.

If a file has an error, the extension discards the full file and shows the reason. The values from
before stay in use. The extension never stops the session because of a configuration file.

## Development

| Command              | Function                                                              |
| -------------------- | --------------------------------------------------------------------- |
| `mise run typecheck` | Examines the types with `tsc`.                                        |
| `mise run lint`      | Examines the source files with ESLint.                                |
| `mise run lint-fix`  | Corrects ESLint errors that have automatic corrections.               |
| `mise run audition`  | Plays the same text through every preset.                             |
| `mise run lab`       | Compares presets and materials with generated prose and code streams. |

The sound lab has three modes, one for each voice. Prose uses `lorem-ipsum` and the text voice.
Reason uses short lowercase sentences and the thinking voice. Call uses `esfuzz` JavaScript and
the tool voice. The call sample is raw code, not a JSON tool-call payload. The lab never runs the
generated code.

Reasoning has shorter sentences than answer text. A reading that follows the structure of the text
finds its sentence reset more frequently in this mode.

Each mode generates a fresh sample when the current sample ends. Preset and material changes keep
the current sample. The selected material applies to all three voices. Switching modes restarts
the selected sample and preserves the speed and pause state.

| Key          | Action                                       |
| ------------ | -------------------------------------------- |
| Tab          | Switch between prose, reason and call.       |
| `r`          | Generate a new sample for the selected mode. |
| Left / Right | Select a preset.                             |
| Up / Down    | Select a material.                           |
| `[` / `]`    | Decrease / increase the stream speed.        |
| Space        | Pause or resume the stream.                  |
| `q`          | Exit the lab.                                |

If code generation returns eight empty samples, the lab shows an error and stops the call stream.
Press `r` to retry. The previous sample remains stored but does not repeat automatically.

The call stream uses `esfuzz.render(esfuzz.generate({ maxDepth: 8 }))`.
`esfuzz` generates parser-fuzzing input, not representative application code.

The lab compares materials and presets with the same sample, so a change of one value is easy to
hear. The lab reads the same configuration files as the extension.

## Platform

The extension operates on macOS only. `afplay` is part of macOS. `ffplay` uses the default audio
output of the system.
