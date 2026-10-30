import { createBus } from "nanoeffects";
import { sveltePlugin } from "nanoeffects/svelte";

// createBus — the event bus: created once, at the top of the module
// sveltePlugin — adds eventStore (an event of the bus as a Svelte store)
export const bus = createBus().use(sveltePlugin());
// eventStore is taken out of the bus once, here, and imported where a component needs it
export const { eventStore } = bus;
