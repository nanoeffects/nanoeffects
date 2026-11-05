import { createBus } from "nanoeffects";
import { devPlugin } from "nanoeffects/dev";
import { reactPlugin } from "nanoeffects/react";

// createBus — the event bus: created once, outside React
// reactPlugin — adds the hooks bus.useEmitter (a value of a component to the bus) and bus.useEventState (an event of the bus to a state)
export const bus = createBus().use(reactPlugin());
export const { useEmitter, useEventState } = bus;

// devPlugin — warns in the console when a handler keeps working after it was cancelled (it lost ctx.signal);
// it does nothing in a production build, so the line can stay. Stop requests with their task through signalFetch(ctx, url): see the docs
bus.use(devPlugin());
