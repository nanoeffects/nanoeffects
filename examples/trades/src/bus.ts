import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";
import { signalPlugin } from "nanoeffects/signal";

// createBus — the event bus
// signalPlugin — emit takes { signal }, so a component can end the connection
export const bus = createBus().use(signalPlugin());

// reactPlugin — adds the hook useEventState; a free hook, so components import it without the bus
export const { useEventState } = bus.use(reactPlugin());
