import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// createBus — the event bus: created once, outside React
// reactPlugin — adds bus.useEmitter, a hook that emits when a value of a component changes
export const bus = createBus().use(reactPlugin());
export const { useEmitter } = bus;
