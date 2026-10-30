import { createJob } from "nanoeffects/actions";

// The events of the pokemon-index entity. This file imports no bus.

// createJob<Payload, Result> — load every pokémon name once; its outcomes give the store its state
export const loadPokemonIndex = createJob<void, string[]>("pokemon-index/load");
