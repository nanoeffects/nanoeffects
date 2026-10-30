// The bus lives outside React: created once here. This file imports no events, no entity and no feature.
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

// createBus — the event bus; reactPlugin adds the hook bus.useEventState
export const bus = createBus().use(reactPlugin());
export const { useEventState, useEmitter } = bus;
