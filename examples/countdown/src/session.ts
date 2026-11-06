// session.ts: one session = one bus. The countdown and the race live here, with no React.
import { type Context, createBus } from "nanoeffects";
import { delay, race, take } from "nanoeffects/effects";

export const SECONDS = 15;

type Events = {
	start: undefined; // the session begins
	claim: undefined; // the user took the discount
	stop: undefined; // the session is thrown away
	tick: number; // seconds left
	finished: "claimed" | "expired";
};

export function createSession() {
	const bus = createBus<Events>(); // createBus: a new bus for every session
	let timerRunning = false;
	let run: Promise<void> = Promise.resolve();

	const countdown = async (ctx: Context<Events>) => {
		timerRunning = true;
		try {
			// race: the first of the three to settle wins, the other two are aborted
			const result = await race(ctx, {
				claimed: take("claim"), // take: wait for the next "claim"
				stopped: take("stop"), // take: wait for the next "stop" (the session is disposed)
				expired: async (child) => {
					for (let left = SECONDS; left > 0; left--) {
						child.emit("tick", left);
						await delay(child, 1000); // delay: wait 1 s, ends at once if the race is over
					}
				},
			});

			if ("claimed" in result) {
				ctx.emit("finished", "claimed");
			}
			if ("expired" in result) {
				ctx.emit("finished", "expired");
			}
		} finally {
			timerRunning = false; // the timer is over, whoever won
		}
	};

	const offStart = bus.on("start", (_, ctx) => {
		run = countdown(ctx);
		return run;
	});

	return {
		bus,
		// what is still alive on this session: used to show that nothing is left
		inspect: () => ({ listeners: bus.get().length, timerRunning }),
		// dispose: "stop" ends the race and its timer, offStart removes the last listener
		dispose: async () => {
			bus.emit("stop");
			offStart();
			await run; // wait until the timer has really stopped
		},
	};
}
