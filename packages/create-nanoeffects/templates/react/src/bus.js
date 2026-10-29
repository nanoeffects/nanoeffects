import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// createBus — the event bus: created once, outside React
// reactPlugin — adds the hooks bus.useEmitter (a value of a component to the bus) and bus.useEventState (an event of the bus to a state)
export const bus = createBus().use(reactPlugin());
export const { useEmitter, useEventState } = bus;
