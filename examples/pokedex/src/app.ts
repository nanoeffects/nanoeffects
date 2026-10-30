import { modulePlugin } from "nanoeffects/actions";
import { bus } from "./bus";
import { abilitiesModule } from "./domains/abilities/abilities-module";
import { pokemonModule } from "./domains/pokemon/pokemon-module";

// modulePlugin — the app that mounts and unmounts domains. The given domains start at the end of
// this block, even if nothing uses the bus yet.
export const app = bus.use(modulePlugin([pokemonModule, abilitiesModule]));
