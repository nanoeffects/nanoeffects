// The bus lives outside React: created once here. This file imports no events and no domain.
import { createBus } from "nanoeffects";

// createBus — the event bus
export const bus = createBus();
