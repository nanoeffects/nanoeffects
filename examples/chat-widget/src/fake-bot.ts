import { delay } from "nanoeffects/effects";

// A stand-in for the server of the bot. It answers after a delay, honors the abort signal as
// fetch does, and fails on every third question, so the retry can be seen working.
let questions = 0;
let polls = 0;

export const fakeBot = {
	async ask(
		text: string,
		{ signal }: { signal: AbortSignal },
	): Promise<string> {
		await delay({ signal }, 900);
		questions += 1;
		if (questions % 3 === 0) {
			throw new Error("503");
		}
		return `You said "${text}". I am only a demo bot.`;
	},

	// the lines that a human operator wrote since the last call: one in four calls has one
	async operatorLines({ signal }: { signal: AbortSignal }): Promise<string[]> {
		await delay({ signal }, 200);
		polls += 1;
		return polls % 4 === 0 ? ["Hi, this is a human. Can I help?"] : [];
	},
};
