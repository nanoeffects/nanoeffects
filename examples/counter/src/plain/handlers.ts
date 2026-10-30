import type { WithSignal } from "nanoeffects";
import { delay, race, retry, take } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import { broken, flaky } from "../server";
import { bus } from "./bus";
import {
	failed,
	incrementBrokenRequested,
	incrementCancelled,
	incremented,
	incrementFlakyRequested,
	incrementLaterRequested,
} from "./counter";

// bus.on — run the handler for each event
// latest — a newer click aborts the older one, like takeLatest in redux-saga
bus.on(
	incrementLaterRequested,
	latest(async (_, ctx) => {
		// race — the first to finish wins, the other is aborted through its signal
		const result = await race(ctx, {
			// delay — wait one second
			waited: ({ signal }) => delay({ signal }, 1000),
			// take — wait for the next incrementCancelled (take asks for the name of the event)
			cancelled: ({ signal }) => take(ctx, incrementCancelled.type, { signal }),
		});

		if ("waited" in result) {
			ctx.emit(incremented()); // the page adds one
		}
	}),
);

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

// One call to the server, tried up to 3 times; a click that is replaced is not a failure
const fromServer = (call: (options: WithSignal) => Promise<void>) =>
	latest(async (_, ctx) => {
		try {
			// retry — try a failed call again, 300 ms apart
			await retry(ctx, () => call({ signal: ctx.signal }), {
				times: 3,
				delay: 300,
			});
			ctx.emit(incremented());
		} catch (error) {
			if (ctx.signal.aborted) {
				return;
			}

			ctx.emit(failed(messageOf(error)));
		}
	});

bus.on(incrementFlakyRequested, fromServer(flaky));
bus.on(incrementBrokenRequested, fromServer(broken));
