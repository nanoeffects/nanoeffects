import type { Context, EventMap } from "nanoeffects";
import { createCommand, createJob } from "nanoeffects/actions";
import { leading } from "nanoeffects/policies";
import type { Pokemon } from "../../api";

// The events of the pokemon domain. This file imports no bus.

// createJob<Payload, Result> — the search for a pokémon by name or number; its outcomes
// (pending, success, fail, cancel) give the page its states
export const findPokemon = createJob<string, Pokemon>("pokemon/find");

// createCommand — an order for this domain, with the handler that does it: search for a pokémon at
// random. leading drops a second click while the first search runs. The pokemon module binds the
// command with module.use.
export const pickRandom = createCommand<void, unknown>(
	"pokemon/pickRandom",
	leading(async (_: unknown, ctx: Context<EventMap>) => {
		const id = 1 + Math.floor(Math.random() * 1025);
		// ctx.emit with a job — runs it and waits until it ends
		await ctx.emit(findPokemon(String(id)));
	}),
);
