import type { BlipConfig, StreamKind } from "../src/config.ts"
import { pitchFromCharacter } from "../src/pitch.ts"
import type { Player } from "../src/player.ts"

export const sleep = (ms: number): Promise<void> => {
	const { promise, resolve } = Promise.withResolvers<void>()
	setTimeout(resolve, ms)
	return promise
}

/** Feed a phrase through the real pitch path at streaming speed. */
export const playText = async (
	player: Player,
	config: BlipConfig,
	kind: StreamKind,
	text: string,
	onBlip?: (char: string, frequency: number) => void,
): Promise<void> => {
	const voice = config.voices[kind]
	let pending = 0

	for (const char of text) {
		pending += 1
		if (pending < voice.charsPerBlip) continue
		pending = 0

		const frequency = pitchFromCharacter(char, voice)
		if (frequency !== undefined) {
			onBlip?.(char, frequency)
			player.play({ frequency, toneMs: voice.toneMs, volume: voice.volume })
		}
		await sleep(config.minIntervalMs)
	}

	await sleep(voice.toneMs * 6)
}
