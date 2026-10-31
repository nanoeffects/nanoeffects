import type { Context, EventMap, WithSignal } from "nanoeffects";
import { poll, retry, timeout } from "nanoeffects/effects";
import { type Line, messageAdded, typingChanged } from "./chat";
import { fakeBot } from "./fake-bot";
import { history } from "./history";

const addLine = (ctx: Context<EventMap>, line: Line) => {
	history.push(line);
	ctx.emit(messageAdded(line)); // after an abort this delivers nothing
};

// one text of the user: show it, ask the bot, show the answer
export const askBot = async (text: string, ctx: Context<EventMap>) => {
	addLine(ctx, { from: "user", text });
	ctx.emit(typingChanged(true));
	try {
		// timeout — give up after 8 s; retry — ask again, 3 attempts in all
		const request = (task: WithSignal) => fakeBot.ask(text, task);
		const askOnce = () => timeout(ctx, 8000, request);
		const answer = await retry(ctx, askOnce, { times: 3, delay: 500 });
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
