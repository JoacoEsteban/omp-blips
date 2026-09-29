# Internals

This page describes how the extension is built: the event streams, the audio daemon, the preset picker, and the development loop.

## Streams

The extension is one observable graph. RxJS holds the parts together, and each part is a function of
its input.

`src/events.ts` is the only file that speaks to the host. It makes a stream from each callback: the
start of a session, the deltas of the assistant, the end of a message, the shutdown, and each
`/blips` call.

`src/index.ts` is a shell. It registers that command once, and holds nothing else: the graph lives
in `src/runtime.ts`, and the shell can read it again from disk while the session runs. See
[Reloading the source](#reloading-the-source).

The state of a session is a fold over those streams. `src/session.ts` holds the reducer. It takes a
session and an event, and it returns the next session. It changes nothing in place.
`src/commands.ts` holds the one step that touches the disk: `reload`, `preset`, `where` and every
voice command read the configuration file, and a command that changes something writes it first.
What they read becomes the event that the reducer gets.

`src/stream.ts` makes blips from the deltas. It groups the chunks by stream kind, so each voice
keeps its own cursor into its own text. A delta only appends to that text. The shared grid is one
timer, and every tick of it is a chance for a cursor to walk its stride and make a tone.
Message boundaries reset the cursors, not the grid. The clock keeps its phase between messages.

The grid period is exact: `1000 / tickHz`, with a floor of 2 milliseconds. Each tick is scheduled
against the moment it is due, not against the moment the last one fired, so a late wake-up costs
that tick alone. `setInterval` does the opposite, and at a 10 millisecond period it drifts a
quarter of a second away within 300 ticks. The due moment travels with the tick and then with the
blip, so the mixer starts the tone at the sample the grid meant, whatever millisecond the timer
woke up on. Auditions use the same period for character arrival and the playback deadline.

`src/player.ts` maps the session to one device. A mute of all three voices closes the process.
The next unmuted state opens a new process.

`src/players/mixer.ts` is the mix as a fold. Play, flush, and clock events go in, and blocks of PCM
come out. The state is a value, so the same events always give the same audio.
`src/players/ffplay.ts` writes those blocks to the process.

A subscription starts the audio, and the end of the subscription stops it. The `session_shutdown`
event stops the upstream commands and grid timer and closes the audio process.

`src/tuner.ts` is the preset picker. The model and the view are values: a keystroke returns the
next model, and the view returns the rows that the host draws. Every effect stays in one graph,
and that graph feeds the same blip pipeline, so the picker hears what a session hears.
`src/arrival.ts` sizes and schedules the deltas it feeds that pipeline, so the sample arrives in
bursts with uneven gaps the way a provider sends one. The `audition` script uses the same
pipeline from the command line.

## Interruption

If you stop the agent, the stream ends before the text is complete. The extension then stops the
blips that still sound. It does not let them ring for text that does not come.

The extension finds this condition in two places. The stream sends a terminal `error` event, and the
message ends with the stop reason `aborted` or `error`. Each of the two makes the same stop. A
provider failure has the same effect as a manual stop.

## Playback

The sound comes from one daemon process for each version of the extension, shared by every omp
session on the machine: the main session, its subagents, and other omp instances. The code is in
`src/bus`.

A session sends its tones to the daemon on a Unix socket, one JSON line for each tone, in
`$XDG_RUNTIME_DIR` or the temporary directory. The first session that finds no daemon starts one.
omp is a compiled Bun, and with `BUN_BE_BUN=1` its binary runs the daemon script as Bun does, so no
other runtime is necessary. The daemon writes its log to `omp-blips-daemon.log` in the temporary
directory, and it stops 30 s after the last session disconnects.

The daemon synthesizes, mixes, and plays through `ffplay`. The code is in
`src/players/ffplay.ts`. Its event loop does nothing else, so a busy omp cannot starve the device.
A tone that omp sends late sounds late, but the audio does not break.

The socket name includes the package version and the newest modification time of the source. A
session never talks to a daemon that runs different code, and in development each edit gets a new
daemon.

The extension finds `ffplay` in this order. The code is in `src/players/locate.ts`.

1. An `ffplay` on the `PATH`. An `ffmpeg` install from a package manager gives this binary.
2. A binary that the extension downloaded before.
3. A new download. The extension downloads the static `ffplay` 9.0.2 build for the platform from
   [ffmpeg.martin-riedl.de](https://ffmpeg.martin-riedl.de/). It compares the file with a pinned
   SHA256 checksum, and then writes the binary to `~/Library/Caches/omp-blips` on macOS or to
   `$XDG_CACHE_HOME/omp-blips` (default `~/.cache/omp-blips`) on Linux.

The download is approximately 29 MB and occurs one time. A notice shows in each session when it
starts and when it ends. If the download fails, a warning shows and there is no audio. The next
daemon tries again. Builds are available for macOS arm64 and x64 and for Linux x64 and arm64. On
other platforms, install `ffmpeg`.

The daemon starts one `ffplay` process and keeps it. The process reads a WAV stream of
interleaved 32-bit float stereo at 44.1 kHz, in packets of 10 ms. A mixer writes new audio each
10 ms and stays 120 ms in front of what the device plays.

`ffplay` needs time to open the audio device: approximately 0.4 s for the built-in speakers and
1 s for AirPods. Audio written in that time waits in its queue, and without a correction it delays
every later tone by the same amount. The mixer reads the playback clock from the status line of
`ffplay`. At the first reading, it stops writing until the device has played the queue down to the
120 ms lead. The blips of the first moment are late, and the blips after them are not.

`ffplay` does not read raw PCM in small parts. It takes 100 ms packets and waits until each is
full, so the stream is a WAV with a set packet size. The WAV is float because `ffplay` checks
16-bit WAV for S/PDIF data first, and on a pipe that check waits for 64 KiB.

The lead has a lower limit. `ffplay` gives SDL audio in 46 ms callbacks, and the clock it reports
does not include two callbacks that are already with the device. With a 40 ms lead, each callback
waited for audio and the sound crackled. From 80 ms, the device kept time as well as with a full
second in the queue. When the mixer ran inside omp, its event loop stopped for up to 130 ms, so the
lead is 120 ms.

Measured from the scheduled moment of a blip to the sound at the built-in microphone, with
`mise run latency`, a blip reaches AirPods Pro in approximately 313 ms. Before these changes, it
took 509 ms.

This design has two results. A tone starts without waiting for a new process. Tones that occur
together, from one session or from several, become one mixed sound.

A tone does not start at the head of the block that carries it. Each play command holds the moment
the grid meant it for, and the mixer places its first sample that far into the block: 5 milliseconds
of lateness is 220 frames of silence before the strike. Without that, every tone inside one 10
millisecond block would collapse onto the same instant, and an even grid could hold no more than
100 ticks a second. With it the grid is bounded by the 2 millisecond floor on its period, not by
the block.

The mixer rings 32 tones at once for each session and 96 in total, and refuses the next one until a
voice ends. The cost of the mix is linear in that number: 32 voices cost under a tenth of a 10
millisecond block, and under a fifth of one when every voice carries motion. The presets that ship
stay far below it. With all three voices reading at once, `haiku` reaches 12 rings and every other
preset stays under 6.

The mix is linear up to 0.8 of full scale. Above that, it bends toward full scale on a `tanh`
curve, so tones that pile up from several sessions become louder without clipping.

A pipe does not discard data. If the daemon's event loop stops for more than 120 ms, all later
blips move back in time and stay late. To prevent this delay, the mixer discards the audio of the
interval that it missed. The tones become older as if the audio had played. As a result, the sound
stays synchronous with the text, but there is a short gap.

After 20 s without a blip, the daemon stops `ffplay`. The next blip starts a new `ffplay`.

A flush releases the active tones of the session that sent it over 6 ms, and the tones of other
sessions ring on. New tones can start during that release without cutting the old release short. A
session that mutes or disconnects flushes its own tones. Up to 120 ms of audio is already in the
pipe, so silence starts a moment after the stop.

## The preset picker

`/blips preset` with no name opens a picker in the terminal. The list holds every preset, and the
preset under the cursor sounds at once: the extension reads a generated sample through it at the
speed of an answer. A `·` marks the preset that the configuration file names today.

The picker auditions one voice at a time, and each voice reads its own kind of text. The text
voice reads prose. The thinking voice reads short lowercase sentences, because reasoning has
shorter sentences than answer text, and a structural reading finds its sentence reset more often
there. The tool voice reads JavaScript from `esfuzz`, which is parser-fuzzing input and not
representative application code. The sample is raw code, not a tool-call payload, and the picker
never runs it.

A voice that is off in the configuration file is silent in the picker too. The picker says `off`
next to that voice. Start it with `/blips text`, `/blips thinking` or `/blips tool`.

| Key          | Action                                             |
| ------------ | -------------------------------------------------- |
| ↑ / ↓        | Move the cursor to another preset.                 |
| ← / → or Tab | Audition another voice.                            |
| `r`          | Generate a new sample for this voice.              |
| `[` / `]`    | Make the stream slower or faster.                  |
| Space        | Pause or continue the stream.                      |
| Enter        | Keep this preset: write it to the file and use it. |
| Esc or `q`   | Leave the configuration file as it is.             |

The speed row gives the rate in characters per second, which is the unit of the `blips/s` on the
grid row above it. The range runs from 1 to 250 characters per second, which covers what a
provider delivers. The picker starts at 100.

The sample does not arrive one character at a time. A provider sends about a token whenever it
has one, so the picker sends deltas of one to twelve graphemes and puts an uneven gap between
them. The speed row gives the average of those deltas, not a metronome. This matters to what you
hear: the buffer in `src/stream.ts` is what turns a burst back into an even line of blips, and a
preset that sounds calm on a smooth stream can sound different on a real one.

Nothing is written before Enter. The write keeps every other key of the file, and the session
takes the preset at once.

The picker needs the interactive terminal. In the print and RPC modes the command says so and
changes nothing.

If the generator gives eight empty samples in a row, the picker shows the reason and stops the
stream. Press `r` to try again.

## Development

To work on the source, run `mise run link`. This command makes a symbolic link in
`~/.omp/agent/extensions/omp-blips`. To remove it, run `mise run unlink`.

| Command              | Function                                                |
| -------------------- | ------------------------------------------------------- |
| `mise run typecheck` | Examines the types with `tsc`.                          |
| `mise run lint`      | Examines the source files with ESLint.                  |
| `mise run lint-fix`  | Corrects ESLint errors that have automatic corrections. |
| `mise run test`      | Runs the unit tests with `bun test`.                    |
| `mise run audition`  | Plays the same text through every preset.               |

The preset picker reads the same configuration file as the extension, and it sounds through the
same pipeline. A change of one preset is therefore easy to hear, and what you hear in the picker
is what the session gives you.

The sample generators are loaded on demand. A session that never opens the picker never imports
`lorem-ipsum` or `esfuzz`.

### Reloading the source

In a checkout, saving a file under `src/` is enough: the extension watches its own source and
reads it again, so an edit to a preset, a material or the mixer is audible on the next blip.
The old graph stops, its `ffplay` device closes with it, and a new graph starts on the same host
streams. Nothing about the session changes.

The watcher runs only where `.jj` or `.git` sits beside `src/`, which is the difference between
source you are editing and an installed copy. Saves arrive in bursts, so they settle for 150 ms
before one reload; a save that leaves every mtime where it was is ignored, because rebuilding for
it would cut a tone for nothing.

omp imports an extension once for the life of the process, and neither `/reload-plugins` nor
`ctx.reload()` reads its source again. What does work is the tag omp puts on the entry it imports:
its loader matches any module of the extension followed by `?mtime=<digits>`, and rewrites the
source it hands back so bare dependencies resolve against the extension and relative imports
inherit that same tag. So importing `runtime.ts` under a new tag re-evaluates the whole graph
below it. `src/hot.ts` computes the tag, and the digits are not optional: a fractional tag misses
that filter, the rewrite is skipped, and the graph fails on its first `import ... from 'rxjs'`.

`src/index.ts` imports `runtime.ts` statically as well. That import is what puts the graph in
front of omp's loader, which only rewrites modules it can reach from the entry.

The new graph is loaded before the running one is torn down, so source that does not compile
reports its error and leaves the session playing what it already had.
