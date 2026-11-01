import { createBus } from "nanoeffects";
import { devPlugin } from "nanoeffects/dev";
import { sveltePlugin } from "nanoeffects/svelte";

// createBus — the event bus: created once, at the top of the module
// sveltePlugin — adds eventStore (an event of the bus as a Svelte store)
export const bus = createBus().use(sveltePlugin());
// eventStore is taken out of the bus once, here, and imported where a component needs it
export const { eventStore } = bus;

// devPlugin — warns in the console when a handler keeps working after it was cancelled (it lost ctx.signal);
// it does nothing in a production build, so the line can stay. Bind the signal once with signalFetch: see the docs
bus.use(devPlugin());
