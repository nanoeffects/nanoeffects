import { createBus } from "nanoeffects";
import { devPlugin } from "nanoeffects/dev";

// createBus — the event bus: created once, at the top of the module
export const bus = createBus();

// devPlugin — warns in the console when a handler keeps working after it was cancelled (it lost ctx.signal);
// it does nothing in a production build, so the line can stay. Bind the signal once with signalFetch: see the docs
bus.use(devPlugin());
