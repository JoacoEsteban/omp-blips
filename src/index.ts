import type { ExtensionAPI, MessageUpdateEvent } from "@oh-my-pi/pi-coding-agent"
import { match, P } from "ts-pattern"
import { defaultConfig, type StreamKind } from "./config.ts"
import { pitchFromCharacter } from "./pitch.ts"
import { createPlayer } from "./player.ts"

interface Chunk {
  readonly kind: StreamKind
  readonly delta: string
}

/** Prose, reasoning, and tool arguments all stream as deltas; each gets its own voice. */
const chunkOf = (
  event: MessageUpdateEvent["assistantMessageEvent"],
): Chunk | undefined =>
  match(event)
    .with({ type: "text_delta", delta: P.select(P.string) }, (delta) => ({
      kind: "text" as const,
      delta,
    }))
    .with({ type: "thinking_delta", delta: P.select(P.string) }, (delta) => ({
      kind: "thinking" as const,
      delta,
    }))
    .with({ type: "toolcall_delta", delta: P.select(P.string) }, (delta) => ({
      kind: "tool" as const,
      delta,
    }))
    .otherwise(() => undefined)

export default function blips(pi: ExtensionAPI): void {
  const config = defaultConfig
  const player = createPlayer(config)

  const enabled: Record<StreamKind, boolean> = {
    text: config.voices.text.enabled,
    thinking: config.voices.thinking.enabled,
    tool: config.voices.tool.enabled,
  }
  const pending: Record<StreamKind, number> = { text: 0, thinking: 0, tool: 0 }

  pi.on("message_update", async (event) => {
    const chunk = chunkOf(event.assistantMessageEvent)
    if (chunk === undefined || !enabled[chunk.kind]) return

    const voice = config.voices[chunk.kind]
    for (const char of chunk.delta) {
      pending[chunk.kind] += 1
      if (pending[chunk.kind] < voice.charsPerBlip) continue
      pending[chunk.kind] = 0

      const frequency = pitchFromCharacter(char, voice)
      if (frequency !== undefined) {
        player.play({ frequency, toneMs: voice.toneMs, volume: voice.volume })
      }
    }
  })

  pi.on("message_end", async () => {
    pending.text = 0
    pending.thinking = 0
    pending.tool = 0
  })

  pi.on("session_shutdown", async () => {
    player.dispose()
  })

  pi.registerCommand("blips", {
    description: "Toggle blips: /blips [on|off|text|thinking|tool]",
    handler: async (args, ctx) => {
      const status = (): string =>
        (["text", "thinking", "tool"] as const)
          .map((kind) => `${kind} ${enabled[kind] ? "on" : "off"}`)
          .join(", ")

      const message = match(args.trim().toLowerCase())
        .with("on", "off", (arg) => {
          const on = arg === "on"
          enabled.text = on
          enabled.thinking = on
          enabled.tool = on
          if (!on) player.dispose()
          return status()
        })
        .with("text", "thinking", "tool", (kind) => {
          enabled[kind] = !enabled[kind]
          return status()
        })
        .otherwise(() => {
          const silent = !enabled.text && !enabled.thinking && !enabled.tool
          enabled.text = silent
          enabled.thinking = silent
          enabled.tool = silent
          if (!silent) player.dispose()
          return status()
        })

      ctx.ui.notify(`Blips: ${message}`, "info")
    },
  })
}
