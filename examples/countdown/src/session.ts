// session.ts: one session = one bus. The countdown and the race live here, with no React.
import { createBus } from "nanoeffects";
import { delay, poll, race, take } from "nanoeffects/effects";

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
	let ended = () => {};
	const handlerDone = new Promise<void>((resolve) => {
		ended = resolve;
	});
	let timerRunning = false;

	// the whole logic: a countdown that races with the button
	bus.on("start", async (_, ctx) => {
		timerRunning = true;
		let left = SECONDS;
		const showLeft = () => ctx.emit("tick", left--);

		// race: the first of the four to settle wins, the other three are aborted
		const result = await race(ctx, {
			claimed: take("claim"), // take: wait for the next "claim"
			stopped: take("stop"), // take: wait for the next "stop" (the session is disposed)
			expired: delay(SECONDS * 1000), // delay: wait 15 s
			// poll: call showLeft every second (at once too); it never ends, the race stops it.
			// With no ctx it is a ready-made function for the group, like take and delay
			ticking: poll(1000, showLeft, { leading: true }),
		});

		timerRunning = false; // the timer is over, whoever won
		if ("claimed" in result) {
			ctx.emit("finished", "claimed");
		}
		if ("expired" in result) {
			ctx.emit("finished", "expired");
		}
		ended(); // tells dispose that the handler has finished
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
		// dispose: "stop" ends the race and its timer, off() removes every listener of this bus.
		// Safe to call twice.
		dispose: async () => {
			bus.emit("stop");
			bus.off(); // off: clear every subscription of this bus
			await handlerDone; // wait until the timer has really stopped
		},
	};
}
