import type { Context, EventMap } from "nanoeffects";
import { poll } from "nanoeffects/effects";
import { api } from "../../api";
import { messageReceived } from "./incoming";

// Ask the server for new messages every 3 s, until the module that started this is unmounted.
// The first argument is the payload of the task; there is none, so it is not used.
export const watchUpdates = async (_: unknown, ctx: Context<EventMap>) => {
	// the number of the last update seen; the first answer only tells where the server is
	let since: number | undefined;

	const check = async () => {
		try {
			const updates = await api.loadUpdates(since, { signal: ctx.signal });
			since = updates.seq;
			for (const message of updates.messages) {
				// ctx.emit — tell the bus; after an abort it delivers nothing
				ctx.emit(messageReceived(message));
			}
		} catch {
			// one failed request must not end the polling: the next tick asks again
		}
	};

	// poll — call `check` now and then every 3 s; an abort of ctx (an unmounted module) ends it
	await poll(ctx, check, 3000, { leading: true });
};
