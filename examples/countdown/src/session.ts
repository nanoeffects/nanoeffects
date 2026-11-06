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

const events = ["start", "claim", "stop", "tick", "finished"] as const;

export function createSession() {
	const bus = createBus<Events>(); // createBus: a new bus for every session
	let running: Promise<void> = Promise.resolve();
	let timerRunning = false;

	// the whole logic: a countdown that races with the button
	bus.on("start", (_, ctx) => {
		timerRunning = true;
		// race: the first of the three to settle wins, the other two are aborted
		running = race(ctx, {
			claimed: take("claim"), // take: wait for the next "claim"
			stopped: take("stop"), // take: wait for the next "stop" (the session is disposed)
			expired: async (child) => {
				for (let left = SECONDS; left > 0; left--) {
					child.emit("tick", left);
					await delay(child, 1000); // delay: wait 1 s, ends at once if the race is over
				}
			},
		}).then((result) => {
			timerRunning = false; // the timer is over, whoever won
			if ("claimed" in result) {
				ctx.emit("finished", "claimed");
			}
			if ("expired" in result) {
				ctx.emit("finished", "expired");
			}
		});
	});

	return {
		bus,
		// what is still alive on this session: used to show that nothing is left
		inspect: () => ({
			listeners: bus.get().length, // get: every listener of the bus
			listenersOf: events.map((name) => ({
				name,
				count: bus.get(name).length,
			})), // get(name): the listeners of one event
			timerRunning,
		}),
		// dispose: "stop" ends the race and its timer, off() removes every listener of this bus
		dispose: async () => {
			bus.emit("stop");
			bus.off(); // off: clear every subscription of this bus
			await running; // wait until the timer has really stopped
		},
	};
}
