import { createBus } from "nanoeffects";

// createBus — the event bus. It needs no plugin: a command carries its own handler.
export const bus = createBus();
