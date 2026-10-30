import type { Context, EventMap } from "nanoeffects";
import { createAction, createCommand } from "nanoeffects/actions";
import { retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

export type Trade = {
	id: number;
	price: number;
	quantity: number;
	time: number;
};
export type Status = "connecting" | "live" | "reconnecting";

// createAction — an event with a payload: every message of the stream, and the state of the connection
export const tradeReceived = createAction<Trade>("trades/received");
export const statusChanged = createAction<Status>("trades/status");

type Message = { t: number; p: string; q: string; T: number };

// Opens the socket and settles when it is over. It never resolves: a closed socket is a failure for
// retry to repeat, and an abort closes the socket and rejects with the abort reason, which retry stops on.
const listen = (symbol: string, ctx: Context<EventMap>) =>
	new Promise<never>((_, reject) => {
		ctx.emit(statusChanged("connecting"));
		const socket = new WebSocket(
			`wss://stream.binance.com:9443/ws/${symbol}@trade`,
		);

		socket.onmessage = (event) => {
			const message: Message = JSON.parse(event.data);
			// ctx.emit — every trade goes to the bus; the screen decides how many it draws
			ctx.emit(statusChanged("live"));
			ctx.emit(
				tradeReceived({
					id: message.t,
					price: Number(message.p),
					quantity: Number(message.q),
					time: message.T,
				}),
			);
		};
		// a drop is a failure for retry to repeat; the status tells the screen that it will
		const drop = (message: string) => {
			ctx.emit(statusChanged("reconnecting"));
			reject(new Error(message));
		};
		socket.onclose = () => drop("The stream closed");
		socket.onerror = () => drop("The stream failed");
		ctx.signal.addEventListener("abort", () => {
			socket.close();
			reject(ctx.signal.reason);
		});
	});

// 0.5 s, 1 s, 2 s ... up to 10 s between attempts
const pause = (attempt: number) => Math.min(10_000, 2 ** attempt * 250);

// createCommand — a call with its handler. The handler is read from the inside out:
// retry — open the socket again after a drop, with no limit of attempts and a growing pause
// latest — a new pair aborts the connection of the old one, and the abort closes its socket
// bus.emit(watchTrades("btcusdt")) settles only when the connection is aborted.
export const watchTrades = createCommand(
	"trades/watch",
	latest(retry(listen, { times: Number.POSITIVE_INFINITY, delay: pause })),
);
