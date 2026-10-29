import { createModule } from "nanoeffects/actions";
import { watchUpdates } from "./incoming-handlers";

export const incomingModule = createModule("incoming", (module) => {
	// spawn — a background task that lives as long as this module: it is aborted on unmount
	module.spawn(watchUpdates);
});
