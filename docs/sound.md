# Sound design

This page describes each part of a blip and each key of the configuration file. For the short version, refer to the [README](../README.md).

## How a blip is made

The agent sends a `message_update` event for each small part of the answer. Each event holds an
`assistantMessageEvent`. Three types of this event carry characters:

- `text_delta` holds the answer text.
- `thinking_delta` holds the reasoning of the model.
- `toolcall_delta` holds the arguments of a tool call. File content in an edit is part of these
  arguments.

The extension gives each of the three types a different voice. Each voice has a reading and a
pitch. The reading answers what a character is. The pitch turns the number from the reading into a
frequency.

The reading does not hold the rate. A shared grid does. The `tickHz` option sets that grid, in
ticks per second, for the whole extension. Each voice sounds on every `divisor` ticks of it, so
the three voices stay locked to each other instead of drifting apart. Arrival of text never moves
the grid: a delta only adds to a buffer, and the grid reads that buffer.

The `stride` option of a voice is the sampling interval in the text. It is the number of
characters the reading walks for one blip, and the blip takes the last number that walk produced.
When the model writes faster than the grid reads, the stride widens and stays wide until the buffer is empty.
The `catchup` option of a voice is how many of its ticks a backlog may take to cross, eight by
default. A voice that must sound every character raises it, and trails the text for longer to do
so; a voice that must stay in step lowers it, and spends resolution instead.
New text can widen the stride further. The tempo does not change. Each blip stands for more text.

The default reading is `alphabet`: `a` is 0, `z` is 25, and the digits continue above the letters.
All other characters are silent. A stride that crosses only whitespace makes no blip, so the
rhythm of the blips still follows the words of the text.

The default pitch is `scalar`. It puts the number in a musical scale of five or six notes per
octave. A pentatonic scale avoids many close semitone steps. Modal resonances add inharmonic
partials, so simultaneous blips can have tension.

The modal synthesizer combines several resonant modes for each material. It adds a short filtered-noise attack.
The dedicated `vocal` material uses measured harmonic phase and amplitude controls across up to 10,000
harmonics. Its procedural contour adds intrinsic rising pitch and cycle motion.

The synthesizer renders each sound as mono PCM at runtime. It keeps rendered sounds in memory.
The mixer places those sounds in stereo without a second copy of each cached sound.
No sampled audio asset or Python runtime is required.

## Voices

These values are the values of the preset `default`. Another preset gives other values.

| Stream     | Lowest pitch | Reading              | Pitch                                       | Material | Touch  | Sound                        |
| ---------- | ------------ | -------------------- | ------------------------------------------- | -------- | ------ | ---------------------------- |
| `text`     | 220 Hz       | `alphabet`, stride 3 | scalar, major pentatonic, 3 octaves, `wrap` | ceramic  | normal | the melody that you follow   |
| `thinking` | 147 Hz       | `alphabet`, stride 4 | scalar, minor pentatonic, 2 octaves, `fold` | wood     | soft   | a dark murmur below the text |
| `tool`     | 523 Hz       | `alphabet`, stride 8 | scalar, major pentatonic, 2 octaves, `wrap` | glass    | soft   | short bright ticks           |

The `tool` voice sounds on every tick of the grid, but it takes the longest stride. Tool arguments
are JSON and contain many characters, so one blip stands for more of them.

Each voice selects its own reading and its own pitch. The preset `gamelan` shows why: the two prose
voices read phrases, and the `tool` voice plays one pitch for dense JSON.

## Readings

A reading consumes the characters of a stream. It turns a character into a number, it makes the
character silent, or it waits for more characters. The file `src/reading.ts` holds the readings. A
reading is a cursor: it reads one character and returns the reading that continues after it. A
reading with memory keeps its state inside that cursor.

A voice has no counter of its own. The grid decides when a blip happens and the `stride` of the
voice decides how much text it crosses; the reading only answers what the characters in that span
were.

| Reading     | Behavior                                                                      |
| ----------- | ----------------------------------------------------------------------------- |
| `alphabet`  | Letters, then digits. All other characters are silent.                        |
| `codepoint` | Each visible character, after a division by `span`. Punctuation sounds too.   |
| `class`     | Four numbers: vowel, consonant, digit, punctuation. Whitespace is silent.     |
| `vowels`    | Vowels only, by their position in `aeiou`. The text becomes much more sparse. |
| `phrase`    | One blip for each word. The length of a word moves the pitch of the next one. |

A blip takes the last number that its stride produced. A stride that crosses only silent
characters makes no blip at all, which is the rest that the text asked for.

`phrase` has memory. It makes one number at the start of each word. The length of that word then
moves the floor of the next word, and the floor returns to zero after a full stop, a question mark
or an exclamation mark. Its stride is still the span the grid walks, so a slow grid against
`phrase` reads one word for each blip.

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

## Modal synthesis

Each stream selects a material and a touch. The first four materials are struck objects: their
partials are inharmonic and they decay from one impulse. Material names evoke familiar objects, but
they do not model physical materials. `reed` and `brass` are generic sustained modal materials. The
dedicated `vocal` material uses a procedural harmonic renderer. Touch settings change the attack,
upper modes, and attack noise.

| Material  | Character                                                      |
| --------- | -------------------------------------------------------------- |
| `wood`    | Few modes with a short decay.                                  |
| `stone`   | Dry low modes with sparse inharmonic upper resonances.         |
| `ceramic` | Bright modes with slight inharmonic spacing.                   |
| `glass`   | Bright upper modes with a long decay.                          |
| `reed`    | Odd harmonics under a low resonance. Hollow, narrow, and dark. |
| `brass`   | Every harmonic under three resonances. Generic rounded voice.  |
| `vocal`   | Rounded low voice, fitted off a recording.                     |

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

The `tickHz` option sets the grid the whole extension sounds on, and the `divisor` of a voice
picks how many of those ticks one of its blips costs. A voice at `divisor: 2` on a 20 Hz grid
makes ten blips a second, whatever the model does. A fast stream widens the stride instead of
stacking sound, so the tempo you set is the tempo you hear.

## Spatial placement

Each voice has a `spatial` object. Presets and configuration files can choose different placement and motion for each voice.
Each preset supplies spatial placement for all three voices, including voices that are disabled.
A file replaces the full `spatial` object rather than merging its parts.
To center a voice without motion, set its `spatial` to `{ "placement": { "kind": "fixed", "at": 0 } }`.

Positions range from `-1` (left only) through `0` (center) to `1` (right only).
Mono sounds use equal-power panning. Placement does not change their pitch or material.

| Placement    | Configuration                                               | Behavior                                                                       |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `fixed`      | `{ "kind": "fixed", "at": -0.3 }`                           | Every blip starts at one position.                                             |
| `characters` | `groups` of `{ "chars": "...", "at": 0 }`, plus `otherwise` | The selected character determines the position. The first matching group wins. |
| `alternate`  | `{ "kind": "alternate", "positions": [-0.5, 0.5] }`         | Emitted blips cycle through a nonempty list of positions.                      |

Character groups match complete graphemes with exact case and no Unicode normalization.
They use the character selected for the blip, not its pitch index or every character crossed by the stride.
Silent characters do not advance alternation. Message boundaries and cursor resets restart it.

This example sends vowels left, digits right, and other sounded characters to the center:

```json
{
  "voices": {
    "text": {
      "spatial": {
        "placement": {
          "kind": "characters",
          "groups": [
            { "chars": "aeiouAEIOU", "at": -1 },
            { "chars": "0123456789", "at": 1 }
          ],
          "otherwise": 0
        }
      }
    }
  }
}
```

### Preset spatial character

| Preset       | Spatial character                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `default`    | A compact stage: vowels just left of center, reasoning further left, and tool ticks in two positions on the right.                   |
| `arcade`     | Text jumps through four positions. Reasoning alternates in a narrower range, while tool ticks jump near the edges.                   |
| `gamelan`    | Four text positions suggest separate instruments. Low tones drift slowly beneath them, and ceramic tool strikes alternate widely.    |
| `sonar`      | Text and reasoning sweep on separate 9- and 13-second cycles. Each tool ping travels from left toward right.                         |
| `typewriter` | Text follows the left and right halves of a QWERTY keyboard. Opening and closing tool brackets occupy opposite sides.                |
| `music-box`  | Text walks eight positions from left to right and back. Reasoning moves gently, with bright tool notes on opposite sides.            |
| `quiet`      | An 18-second drift stays close to the center. Reasoning sits slightly left. The tool voice remains disabled.                         |
| `haiku`      | Text and reasoning follow different slow sweeps. Quiet tool tones alternate widely and move slightly during each note.               |
| `pulse`      | Text alternates narrowly around a centered reasoning voice. Tool accents alternate further out.                                      |
| `plainchant` | Text vowels form three groups: `a/e` left, `i` center, and `o/u` right. Reasoning moves slightly on the left. Tools remain disabled. |
| `cipher`     | Letters `a–m` sit left and `n–z` right. Reasoning reverses that mapping. Tool digits separate from letters.                          |
| `telegraph`  | Text and reasoning occupy fixed positions on opposite sides. Tool ticks alternate near the edges. No continuous motion.              |
| `geiger`     | Text sits slightly left and reasoning slightly right, both fixed. Tool ticks alternate wide. No motion at this rate.                 |
| `hexdump`    | Tool opening brackets sit fully left and closing brackets fully right. Quotes and separators sit nearer the center.                  |
| `sans`       | Text vowels and other characters sit just either side of center. Reasoning drifts slightly left, with dry tool knocks on the right.  |

These choices change position, not pitch, timbre, gain, or cadence. Character groups include uppercase letters where applicable.
Continuous motion stays slow for sustained presets. Short rhythmic presets use discrete positions instead.

### Motion

An optional `motion` adds sinusoidal movement around the placement. The final position stays within `[-1, 1]`.
`depth` ranges from `0` to `1`. `periodMs` is a positive number of milliseconds for one cycle.

```json
{
  "spatial": {
    "placement": { "kind": "fixed", "at": 0 },
    "motion": {
      "kind": "oscillate",
      "clock": "voice",
      "depth": 0.6,
      "periodMs": 2400
    }
  }
}
```

This object belongs inside a voice. With `clock: "tone"`, each blip starts its motion at its base position.
With `clock: "voice"`, motion follows the shared monotonic timeline and continues across blips, messages, and device restarts.
Voices with the same period share the same phase. Motion continues while a tone rings, not only between blips.

The mixer accepts mono and stereo source representations. Stereo sources keep distinct channels at the center and route both channels at either hard edge.
Current materials still generate mono sources. This change adds no width effects, echo, chorus, or reverb.

## Presets

A preset is a complete set of values for the three voices. The file `src/presets.ts` holds the
presets, except the `sans` preset, which lives next to nothing else because it depends on a voice
profile: `src/preset-sans.ts`. The default preset has the name `default`.

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
| `geiger`     | One tick for each character, at any speed the text arrives.                         | `class`     |
| `hexdump`    | Raw bytes. Punctuation sounds, and the tool calls lead.                             | `codepoint` |
| `psychosis`  | Two mouths on every character and a needle over them, none agreeing.                | `codepoint` |
| `sans`       | A rising vocal blip. Rounded low tones, one for each character.                     | `vocal`     |

The eight presets after `quiet` each show one reading or one pitch with nothing in its way:

- `haiku` gives `phrase` long tones on a slow grid, so no word is lost.
- `pulse` puts `phrase` against `drone`. The reading keeps the words and the pitch drops the
  melody, so only the rhythm remains.
- `plainchant` keeps `vowels` in one octave. Vowels are the part of a word that a singer holds.
- `cipher` puts `alphabet` against `chromatic` at a stride of one letter. The pitch goes up with
  the alphabet and there is no scale, so `a` is always the same note.
- `telegraph` puts `class` against `drone` at a stride of one character. Only whitespace is
  silent, so the words show as gaps.
- `geiger` is `telegraph` with nothing held back. Its grid runs at 250 ticks a second, which is
  faster than a provider streams, and each voice takes every grapheme with a `catchup` of 32 so
  the stride never widens through a burst. At 250 characters a second it sounds 209 blips a
  second, which is every character that is not whitespace. Its tones last 8 to 12 milliseconds,
  which is longer than the 4 millisecond period, so they overlap. That is deliberate: the modal
  renderer builds its resonances across the length of a tone, so a tone as short as the period is
  some thirty times quieter than a normal one and the whole preset disappears. Every voice is
  struck `firm` for the same reason, because a `soft` attack alone takes 8 milliseconds.
- `hexdump` reads the tool arguments character by character. It is the one preset in which the
  tool voice leads.
- `psychosis` puts both generic tracts to work at once. A tract is a harmonic source read
  through resonances that stay at fixed frequencies while the pitch moves, so a character can
  choose its note and its mouth shape separately. The two prose voices take opposite sides of
  that. The answer voice freezes the shape and moves only in pitch, through a dissonant mode
  that `fold` keeps turning back on itself. The reasoning voice moves in both and lets neither
  cycle divide the other: the character picks a note out of 29 through a restless scale that
  `wrap` sends climbing and snapping back to the bottom, and the same character picks one of
  four mouth shapes, so the pair takes 116 characters to come back to where it started.
  Nothing in that voice articulates — the swell eats over half of each tone, the decay barely
  falls, and every tone sags a major sixth on the way out — so the groans pile up eleven deep
  into a cluster that keeps rearranging itself. Over the two of them the tool voice is a struck
  needle that falls a tenth inside 28 milliseconds.
  All three read every character. The grid runs at 125 ticks a second, so the cursor drains
  faster than a provider streams and the stride never widens; that rate is a ceiling, not a
  tempo, so what sounds is the speed of the text. Prose overlaps three or four tones deep, and a
  token that arrives all at once surges to thirteen. The tones last 104, 88 and 28 milliseconds,
  which is 28 of the 32 voices the mixer rings, so no character is lost even at full speed. The
  answer voice moves inside each tone, the reasoning swings across the whole mix on a period
  that shares no factor with it, and the tool voice jumps between six uneven positions.

`sans` uses the dedicated `vocal` material for a low character voice. Each text blip lasts 140 milliseconds
at 164.81 Hz. It rises across its first 15%, holds until its midpoint, then fades.
The grid stays at 15.2 ticks a second, independent of the blip duration.
One character shape is used for each character.
The reasoning voice uses the same renderer and envelope with a quieter, softer touch,
at 123.47 Hz, reading twice as much text for each blip. The tool voice remains a short stone knock.

The `vocal` renderer uses measured harmonic phase and amplitude controls for harmonics up to about 10,000 Hz.
Its intrinsic contour adds rising pitch and cycle motion during each tone. All samples come from this
runtime procedure. The preset does not load a sampled recording and does not require Python.

Those controls are one value, not code. `src/vocal.ts` renders any `VocalProfile` and knows nothing
about the voice itself, `src/vocal-profile.ts` holds the Sans fit, and `src/synth.ts` maps each vocal
material to its profile. Another voice is another profile file and one more material name.

A profile is built through the constructors in `src/curve.ts`, not written as parallel lists. A `Curve`
carries its own knots: `measured` places its values at the cadence they were measured at, over the
115 millisecond blip the fit was taken from, and `spread` places its values evenly across the tone.
The renderer reads every one of them through a single `at` function.

To hear all presets one after the other, run `mise run audition`.

To select a preset, write its name in a configuration file:

```json
{ "preset": "gamelan" }
```

A configuration file can also change single values of the preset. The extension applies the preset
first, then the file.

To select a preset in a session, run `/blips preset gamelan`. The command writes the name into the
configuration file, so the choice holds for the next session too. To see the list of names, run
`/blips presets`.

## Configuration

A change to the sound does not need a change to the code in `src/`. The extension reads one file:
`~/.omp/agent/blips.json`, or `$PI_CODING_AGENT_DIR/blips.json` for a different profile. There is
no per-project file: the sound of the agent belongs to the machine, not to the repository.

The file is optional. The extension starts with the default values, then applies the preset, then
the file. The file gives only the keys that it changes.

The commands write this same file. `/blips off`, `/blips text` and the others store the state of
the three voices in `voices.*.enabled`, and `/blips preset` stores `preset`. A file that does not
parse is never rewritten, so a hand-written file is never lost to a command; the command reports
the reason and changes nothing.

```json
{
  "preset": "gamelan",
  "tickHz": 20,
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

| Key      | Type            | Function                                                          |
| -------- | --------------- | ----------------------------------------------------------------- |
| `preset` | a preset name   | The preset that gives the start values.                           |
| `tickHz` | positive number | The shared grid, in ticks per second, that every voice sounds on. |

Each voice under `voices.text`, `voices.thinking` and `voices.tool` accepts these keys:

| Key             | Type                                                                           | Function                                                         |
| --------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `enabled`       | boolean                                                                        | Whether this voice sounds. The voice commands write this key.    |
| `divisor`       | positive integer                                                               | Ticks of the grid spent on one blip of this voice.               |
| `stride`        | positive integer                                                               | Characters the reading walks for one blip.                       |
| `catchup`       | positive integer                                                               | Ticks a backlog may take to cross. Higher keeps every character. |
| `toneMs`        | number                                                                         | The length of one tone in milliseconds.                          |
| `decay`         | positive number                                                                | Multiplies the material's decay rate. Lower values ring longer.  |
| `swell`         | number from 0 to 1                                                             | The part of the tone spent rising to full level.                 |
| `hold`          | number from 0 to 1                                                             | The part of the tone held at full body before the decay starts.  |
| `glide`         | number                                                                         | Semitones the pitch falls across one tone. 0 holds it steady.    |
| `volume`        | number from 0 to 1                                                             | The loudness of this voice.                                      |
| `material`      | `"wood"`, `"stone"`, `"ceramic"`, `"glass"`, `"reed"`, `"brass"`, or `"vocal"` | The resonant material.                                           |
| `color`         | a colour object                                                                | Where the second resonance sits, for a sustained material.       |
| `touch`         | `"soft"`, `"normal"`, or `"firm"`                                              | The attack and upper-mode strength.                              |
| `baseFrequency` | number                                                                         | The reference frequency in Hz of this voice.                     |
| `reading`       | a reading object                                                               | How a character becomes a number, or becomes silent.             |
| `pitch`         | a pitch object                                                                 | How that number becomes a frequency.                             |

A colour object is either `{ "kind": "fixed", "at": <0 to 1> }` or
`{ "kind": "vowel", "span": <count> }`.

The file `blips.example.json` shows material and touch keys with example values.

### Errors in a configuration file

The extension examines the file against a schema. An unknown key is an error. As a result, an error
in the spelling of a key is visible and does not stay silent.

If a file has an error, the extension discards the full file and shows the reason. The values from
before stay in use. The extension never stops the session because of a configuration file.
