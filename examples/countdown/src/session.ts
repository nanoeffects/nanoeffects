// session.ts: one session = one bus. The countdown and the race live here, with no React.
import { createBus } from "nanoeffects";
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

	bus.on("start", async (_, ctx) => {
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
	});

	return {
		bus,
		// dispose: "stop" ends the running race, so the old timer stops at once
		dispose: () => bus.emit("stop"),
	};
}
