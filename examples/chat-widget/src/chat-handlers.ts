import type { Context, EventMap } from "nanoeffects";
import { poll, retry, timeout } from "nanoeffects/effects";
import { type Line, messageAdded, typingChanged } from "./chat";
import { fakeBot } from "./fake-bot";
import { history } from "./history";

const addLine = (ctx: Context<EventMap>, line: Line) => {
	history.push(line);
	ctx.emit(messageAdded(line)); // after an abort this delivers nothing
};

// the request of one text: a task that gets the text and its context
const request = (text: string, ctx: Context<EventMap>) =>
	fakeBot.ask(text, ctx);

// timeout — give up after 8 s; retry — ask again, 3 attempts in all. Both wrap a task and
// give one back, so the call below runs with the context of the caller and its abort.
const requestWithRetry = retry(timeout(8000, request), {
	times: 3,
	delay: 500,
});

// one text of the user: show it, ask the bot, show the answer
export const askBot = async (text: string, ctx: Context<EventMap>) => {
	addLine(ctx, { from: "user", text });
	ctx.emit(typingChanged(true));
	try {
		const answer = await requestWithRetry(text, ctx);
		addLine(ctx, { from: "bot", text: answer });
	} catch {
		// an abort (the chat was closed) lands here too, and addLine delivers nothing then
		addLine(ctx, {
			from: "bot",
			text: "The bot is not answering. Try again later.",
		});
	} finally {
		ctx.emit(typingChanged(false));
	}
};

// lines that a human operator wrote in the meantime, asked for every 5 s
export const watchOperator = async (_: unknown, ctx: Context<EventMap>) => {
	const check = async () => {
		try {
			const texts = await fakeBot.operatorLines(ctx);
			for (const text of texts) {
				addLine(ctx, { from: "operator", text });
			}
		} catch {
			// one failed request must not stop the polling: the next tick asks again
		}
	};

	// poll — call `check` every 5 s; an abort of ctx (the module unmounted) ends it
	await poll(ctx, check, 5000);
};
