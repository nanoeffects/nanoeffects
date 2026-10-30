// The events and commands of the price stream. This file imports no bus.
import { createAction, createCommand } from "nanoeffects/actions";
import type { Feed } from "./feed";
import { guardHandler, watchHandler } from "./prices-handlers";

// What a socket asks for, and how to answer it
export type Watch = {
	socketId: number;
	symbol: string;
	send: (message: object) => void;
};

// A socket to keep an eye on, and how to close it
export type Guard = { socketId: number; close: () => void };

type Settings = { feed: Feed; tickMs: number; idleMs: number };

// createAction — a message came in on this socket (the payload is the id of the socket)
export const heard = createAction<number>("prices/heard");

// createPrices — makes the two commands. Each carries its handler, which uses the settings it is given.
export const createPrices = ({ feed, tickMs, idleMs }: Settings) => ({
	watchSymbol: createCommand("prices/watch", watchHandler({ feed, tickMs })),
	guardIdle: createCommand("prices/guard", guardHandler({ idleMs })),
});
