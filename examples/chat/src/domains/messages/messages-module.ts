import { createModule } from "nanoeffects/actions";
import { messageReceived } from "../incoming/incoming";
import { roomSelected } from "../rooms/rooms";
import { loadHistory, markMessage, sendMessage } from "./messages";
import { deliver, fetchHistory, SendFailed } from "./messages-handlers";
import { messagesStore } from "./messages-store";

export const messagesModule = createModule("messages", (module) => {
	// the mutations of the store: each one is called with the data of an event
	const {
		startLoading,
		showHistory,
		stopLoading,
		addSending,
		markDelivered,
		markFailed,
		failEverythingSending,
		addReceived,
	} = messagesStore.getState();

	// handle — this module does the work of its two jobs while it is mounted
	module.handle(loadHistory, fetchHistory);
	module.handle(sendMessage, deliver);

	// a new room starts a load; latest in fetchHistory aborts the one still running
	module.on(roomSelected, (roomId, ctx) => {
		ctx.emit(loadHistory(roomId));
	});

	// the outcomes of the load: the state follows them, so an aborted load clears the flag too
	module.on(loadHistory.pending, startLoading);
	module.on(loadHistory.success, showHistory);
	module.on(loadHistory.fail, stopLoading);
	module.on(loadHistory.cancel, stopLoading);

	// the outcomes of a send: the message is shown at once, then delivered or failed
	module.on(sendMessage.pending, addSending);
	module.on(sendMessage.success, markDelivered);
	module.on(sendMessage.fail, (error) => {
		// the outcome `fail` carries only the error; SendFailed says which message it was
		if (error instanceof SendFailed) {
			markFailed(error.localId);
		}
	});
	module.on(sendMessage.cancel, failEverythingSending);

	module.on(messageReceived, addReceived);
	// use — a command that carries its handler: bind it for as long as this module is mounted
	module.use(markMessage);
});
