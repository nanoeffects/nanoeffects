import websocket from "@fastify/websocket";
import Fastify from "fastify";
import type { WebSocket } from "ws";
import { bus } from "./bus";
import { createFeed, type Feed } from "./feed";
import { createPrices, heard } from "./prices";

type Options = {
	feed?: Feed;
	// how often a price is sent, in ms
	tickMs?: number;
	// how long a socket may be silent, in ms
	idleMs?: number;
	log?: (message: string) => void;
};

// the one message a client sends: { "subscribe": "BTC" }
const symbolOf = (data: unknown): string | undefined => {
	try {
		const message = JSON.parse(String(data));
		if (typeof message.subscribe === "string" && message.subscribe !== "") {
			return message.subscribe;
		}
	} catch {
		// not JSON: no symbol
	}
};

export const buildServer = ({
	feed = createFeed(),
	tickMs = 1000,
	idleMs = 30_000,
	log = console.log,
}: Options = {}) => {
	const app = Fastify();
	const { watchSymbol, guardIdle } = createPrices({ feed, tickMs, idleMs });

	// One controller for each open socket. Everything started for the socket gets its signal, so
	// closing the socket stops the subscription, the idle guard and what they started.
	const controllers = new Set<AbortController>();
	let lastSocketId = 0;

	const serve = (socket: WebSocket) => {
		lastSocketId += 1;
		const socketId = lastSocketId;
		const controller = new AbortController();
		controllers.add(controller);

		const send = (message: object) => socket.send(JSON.stringify(message));

		// An abort rejects the call, which is not a failure here; anything else is logged.
		const run = async (call: () => unknown) => {
			try {
				await call();
			} catch (error) {
				if (!controller.signal.aborted) {
					log(`socket ${socketId}: ${String(error)}`);
				}
			}
		};
		const { signal } = controller;

		socket.on("close", () => {
			controllers.delete(controller);
			controller.abort();
		});

		socket.on("message", (data) => {
			bus.emit(heard(socketId));
			const symbol = symbolOf(data);
			if (symbol) {
				// emit with { signal } — through signalPlugin: closing the socket aborts this subscription
				run(() =>
					bus.emit(watchSymbol({ socketId, symbol, send }), { signal }),
				);
			} else {
				send({ error: 'send { "subscribe": "BTC" }' });
			}
		});

		const close = () => socket.close(1001, "idle");
		run(() => bus.emit(guardIdle({ socketId, close }), { signal }));
	};

	app.register(websocket);
	app.register(async (instance) => {
		instance.get("/prices", { websocket: true }, serve);
	});

	// Abort the work of every socket, close the sockets with 1001 ("going away"), then close the
	// app. After 2 s the wait ends anyway.
	const shutdown = () => {
		for (const controller of controllers) {
			controller.abort();
		}
		for (const client of app.websocketServer.clients) {
			client.close(1001, "server stopping");
		}

		return new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 2000);
			timer.unref();
			app.close().then(resolve, resolve);
		});
	};

	return { app, shutdown };
};
