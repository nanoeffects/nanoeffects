import { createBus } from "nanoeffects";
import { vuePlugin } from "nanoeffects/vue";

// createBus — the event bus: created once, outside Vue
// vuePlugin — adds watchEmitter (a value of a component to the bus) and useEventRef (an event of the bus to a ref)
export const bus = createBus().use(vuePlugin());
export const { watchEmitter, useEventRef } = bus;
