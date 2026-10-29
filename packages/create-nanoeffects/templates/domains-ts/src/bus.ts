import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// createBus — the event bus, created once. It imports no events and no domain.
// reactPlugin — adds the hook bus.useEventState (an event of the bus to a component state)
export const bus = createBus().use(reactPlugin());
export const { useEventState } = bus;
