import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent"
import { match, P } from "ts-pattern"
import { defaultConfig } from "./config.ts"
import { pitchFromCharacter } from "./pitch.ts"
import { createPlayer } from "./player.ts"

export default function blips(pi: ExtensionAPI): void {
  const config = defaultConfig
  const player = createPlayer(config)
  let enabled = true
  let charsSinceBlip = 0

  pi.on("message_update", async (event) => {
    if (!enabled) return

    const delta = match(event.assistantMessageEvent)
      .with({ type: "text_delta", delta: P.select(P.string) }, (text) => text)
      .with({ type: "thinking_delta", delta: P.select(P.string) }, (text) =>
        config.thinking ? text : undefined,
      )
      .otherwise(() => undefined)
    if (delta === undefined) return

    for (const char of delta) {
      charsSinceBlip += 1
      if (charsSinceBlip < config.charsPerBlip) continue
      charsSinceBlip = 0

      const frequency = pitchFromCharacter(char, config)
      if (frequency !== undefined) player.play(frequency)
    }
  })

  pi.on("message_end", async () => {
    charsSinceBlip = 0
  })

  pi.on("session_shutdown", async () => {
    player.dispose()
  })

  pi.registerCommand("blips", {
    description: "Toggle streaming blips (/blips on|off)",
    handler: async (args, ctx) => {
      enabled = match(args.trim().toLowerCase())
        .with("on", () => true)
        .with("off", () => false)
        .otherwise(() => !enabled)

      if (!enabled) player.dispose()
      ctx.ui.notify(`Blips ${enabled ? "on" : "off"}`, "info")
    },
  })
}
