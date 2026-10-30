import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// createBus — the event bus; signalPlugin — emit takes { signal }, so React Query can abort a request
export const bus = createBus().use(signalPlugin());
