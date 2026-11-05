import { createBus } from "nanoeffects";
import { devPlugin } from "nanoeffects/dev";
import { vuePlugin } from "nanoeffects/vue";

// createBus — the event bus: created once, outside Vue
// vuePlugin — adds watchEmitter (a value of a component to the bus) and useEventRef (an event of the bus to a ref)
export const bus = createBus().use(vuePlugin());
export const { watchEmitter, useEventRef } = bus;

// devPlugin — warns in the console when a handler keeps working after it was cancelled (it lost ctx.signal);
// it does nothing in a production build, so the line can stay. Stop requests with their task through signalFetch(ctx, url): see the docs
bus.use(devPlugin());
