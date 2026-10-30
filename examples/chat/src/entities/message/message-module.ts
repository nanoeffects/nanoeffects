import { createModule } from "nanoeffects/actions";
import {
	loadHistory,
	markMessage,
	messageReceived,
	sendMessage,
} from "./message";
import { deliver, fetchHistory, SendFailed } from "./message-handlers";
import { messageStore } from "./message-store";

export const messageModule = createModule("message", (module) => {
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
	} = messageStore.getState();

	// handle — this module does the work of its two jobs while it is mounted
	module.handle(loadHistory, fetchHistory);
	module.handle(sendMessage, deliver);

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
