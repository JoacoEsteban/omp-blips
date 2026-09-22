import type { BlipConfig, StreamKind } from "../src/config.ts"
import { pitchFromCharacter } from "../src/pitch.ts"
import type { VoicedPlayer } from "../src/player.ts"

export const sleep = (ms: number): Promise<void> => {
	const { promise, resolve } = Promise.withResolvers<void>()
	setTimeout(resolve, ms)
	return promise
}

/** Feed a phrase through the real pitch path at streaming speed. */
export const playText = async (
	player: VoicedPlayer,
	config: BlipConfig,
	kind: StreamKind,
	text: string,
	onBlip?: (char: string, frequency: number) => void,
): Promise<void> => {
	const voice = config.voices[kind]
	let pending = 0

	for (const char of text) {
		// Same rule as the extension: only a pitched character spends the budget.
		const frequency = pitchFromCharacter(char, voice)
		if (frequency !== undefined) {
			pending += 1
			if (pending >= voice.charsPerBlip) {
				pending = 0
				onBlip?.(char, frequency)
				player.play(kind, {
					frequency,
					toneMs: voice.toneMs,
					decay: voice.decay,
					material: voice.material,
					touch: voice.touch,
					volume: voice.volume,
				})
			}
		}
		await sleep(config.minIntervalMs)
	}

	await sleep(voice.toneMs * 6)
}
