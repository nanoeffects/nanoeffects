import type { Context, WithSignal } from "nanoeffects";
import { delay, race, retry, take } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import { broken, flaky } from "../server";
import { bus, type Events } from "./bus";
import {
	failed,
	incrementBrokenRequested,
	incrementCancelled,
	incremented,
	incrementFlakyRequested,
	incrementLaterRequested,
} from "./slice";

// bus.on — run the handler for each action
// latest — a newer click aborts the older one, like takeLatest in redux-saga
bus.on(
	incrementLaterRequested,
	latest(async (_, ctx) => {
		// race — the first to finish wins, the other is aborted through its signal
		const result = await race(ctx, {
			// delay without ctx — a starter that waits one second
			waited: delay(1000),
			// take without ctx — a starter that waits for the next incrementCancelled
			cancelled: take(incrementCancelled),
		});

		if ("waited" in result) {
			ctx.store.dispatch(incremented()); // the reducer adds one
		}
	}),
);

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

// One call to the server, tried up to 3 times; a click that is replaced is not a failure
// The type of ctx is written out because the handler is made apart from bus.on (checker only)
const fromServer = (call: (options: WithSignal) => Promise<void>) =>
	latest(async (_: unknown, ctx: Context<Events>) => {
		try {
			// retry — try a failed call again, 300 ms apart
			await retry(ctx, () => call({ signal: ctx.signal }), {
				times: 3,
				delay: 300,
			});
			ctx.store.dispatch(incremented());
		} catch (error) {
			if (ctx.signal.aborted) {
				return;
			}

			ctx.store.dispatch(failed(messageOf(error)));
		}
	});

bus.on(incrementFlakyRequested, fromServer(flaky));
bus.on(incrementBrokenRequested, fromServer(broken));
