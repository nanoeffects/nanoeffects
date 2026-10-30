import type { Context, EventMap, WithSignal } from "nanoeffects";
import { retry, timeout } from "nanoeffects/effects";
import { debounce, latest, leading } from "nanoeffects/policies";
import { api, HttpError } from "../../api";
import { findPokemon } from "./pokemon";

// The work of the pokemon domain.

// One request for a pokémon. It gets the signal from the task, so an abort cancels the request.
const load = (query: string, { signal }: WithSignal) =>
	api.getPokemon(query, { signal });

// A 404 is an answer: asking again gives the same answer. A busy server or a lost connection may pass.
const isWorthRetrying = (error: unknown) =>
	!(error instanceof HttpError && error.status < 500);

// Read from the inside out:
// retry — try the request again, up to 3 attempts, 300 ms apart, unless the answer was a "no"
// timeout — all the attempts together may take 8 s
// latest — a newer search aborts the older one, and the older result is never delivered
// debounce — wait 400 ms of quiet before a search starts
export const searchPokemon = debounce(
	400,
	latest(
		timeout(
			8000,
			retry(load, { times: 3, delay: 300, shouldRetry: isWorthRetrying }),
		),
	),
);

// leading — a second click while the first search runs does nothing
export const pickRandomPokemon = leading(
	async (_: unknown, ctx: Context<EventMap>) => {
		const id = 1 + Math.floor(Math.random() * 1025);
		// ctx.emit with a job — runs it and waits until it ends
		await ctx.emit(findPokemon(String(id)));
	},
);
