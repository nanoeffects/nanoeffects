import type { Context, EventMap } from "nanoeffects";
import { delay, poll, race, take } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import type { Feed } from "./feed";
import { type Guard, heard, type Watch } from "./prices";

// The work of the price stream.

// latest — a new subscription aborts the old one; key — but only the old one of the same socket
// poll — send a price now and every tickMs, until the task is aborted (the socket closed, or a newer subscription)
export const watchHandler = ({
	feed,
	tickMs,
}: {
	feed: Feed;
	tickMs: number;
}) =>
	latest(
		async (call: Watch, ctx) => {
			let tick = 0;
			const sendPrice = () => {
				tick += 1;
				const price = feed.priceOf(call.symbol, tick);
				call.send({ symbol: call.symbol, price, time: tick });
			};

			await poll(ctx, sendPrice, tickMs, { leading: true });
		},
		{ key: (call) => call.socketId },
	);

// Closes a socket that has been silent for idleMs. Each message of the socket starts the wait again.
export const guardHandler =
	({ idleMs }: { idleMs: number }) =>
	async (guard: Guard, ctx: Context<EventMap>) => {
		const fromThisSocket = (socketId: number) => socketId === guard.socketId;

		for (;;) {
			// race — the first to finish wins: a message of this socket, or the end of the time.
			// race gives each starter its own child, so the loser is stopped with it.
			const result = await race(ctx, {
				heard: take(heard, { predicate: fromThisSocket }), // take without ctx: a starter
				idle: delay(idleMs), // delay without ctx: a starter
			});

			if ("idle" in result) {
				guard.close();
				return;
			}
		}
	};
