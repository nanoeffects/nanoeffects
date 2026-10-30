import { createModule } from "nanoeffects/actions";
import { watchUpdates } from "./receive-messages-handlers";

export const receiveMessagesModule = createModule(
	"receive-messages",
	(module) => {
		// spawn — a background task that lives as long as this module: it is aborted on unmount
		module.spawn(watchUpdates);
	},
);
