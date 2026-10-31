import { createBus } from "nanoeffects";

// createBus — the event bus. It needs no plugin: an action carries its own handler.
export const bus = createBus();
