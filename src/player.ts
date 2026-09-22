import { match } from "ts-pattern"
import type { BlipConfig, StreamKind } from "./config.ts"
import { createAfplayPlayer } from "./players/afplay.ts"
import { createFfplayPlayer } from "./players/ffplay.ts"
import type { Player, Tone } from "./players/types.ts"

export type { Player, Tone } from "./players/types.ts"

/** A player that knows which voice a tone belongs to, so it can pace each one separately. */
export interface VoicedPlayer {
	readonly play: (kind: StreamKind, tone: Tone) => void
	readonly dispose: () => void
}

const backend = (config: BlipConfig): Player =>
	match(config.backend)
		.with("ffplay", () => createFfplayPlayer())
		.with("afplay", () => createAfplayPlayer())
		.exhaustive()

/**
 * Backend plus a rate limit. The floor is kept per stream kind: the three
 * voices are meant to layer, so a hot `thinking` stream must not spend the
 * budget that `text` and `tool` blips need.
 */
export const createPlayer = (config: BlipConfig): VoicedPlayer => {
	const player = backend(config)
	/** `-Infinity`, not 0: `performance.now()` is near zero at startup, which would eat the first blips. */
	const lastPlayedAt: Record<StreamKind, number> = {
		text: Number.NEGATIVE_INFINITY,
		thinking: Number.NEGATIVE_INFINITY,
		tool: Number.NEGATIVE_INFINITY,
	}

	const play = (kind: StreamKind, tone: Tone): void => {
		const now = performance.now()
		if (now - lastPlayedAt[kind] < config.minIntervalMs) return
		lastPlayedAt[kind] = now
		player.play(tone)
	}

	return { play, dispose: player.dispose }
}
