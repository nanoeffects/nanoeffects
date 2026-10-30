// The bus of the server. This file imports no command and no handler.
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// createBus — the event bus; signalPlugin — emit takes { signal }, so a closed connection can abort the work
const signal = signalPlugin();
export const bus = createBus().use(signal);
