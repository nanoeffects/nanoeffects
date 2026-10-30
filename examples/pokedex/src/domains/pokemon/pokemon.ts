import { createCommand, createJob } from "nanoeffects/actions";
import type { Pokemon } from "../../api";

// The events of the pokemon domain. This file imports no bus.

// createJob<Payload, Result> — the search for a pokémon by name or number; its outcomes
// (pending, success, fail, cancel) give the page its states
export const findPokemon = createJob<string, Pokemon>("pokemon/find");

// createCommand — an order for this domain: search for a pokémon at random. The pokemon module
// answers it.
export const pickRandom = createCommand<void, unknown>("pokemon/pickRandom");
