import { createModule } from "nanoeffects/actions";
import { messageReceived } from "../incoming/incoming";
import { roomSelected } from "../rooms/rooms";
import { loadHistory, messageMarked, sendMessage } from "./messages";
import { deliver, fetchHistory, SendFailed } from "./messages-handlers";
import { type ChatMessage, messagesStore } from "./messages-store";

// the same list, with the changes applied to the message that has this id
const changeMessage = (
	messages: ChatMessage[],
	localId: string,
	next: Partial<ChatMessage>,
) =>
	messages.map((message) =>
		message.id === localId ? { ...message, ...next } : message,
	);

export const messagesModule = createModule("messages", (module) => {
	// handle — this module does the work of its two jobs while it is mounted
	module.handle(loadHistory, fetchHistory);
	module.handle(sendMessage, deliver);

	// a new room starts a load; latest in fetchHistory aborts the one still running
	module.on(roomSelected, (roomId, ctx) => {
		ctx.emit(loadHistory(roomId));
	});

	// the outcomes of the load: the state follows them, so an aborted load clears the flag too
	module.on(loadHistory.pending, (roomId) =>
		messagesStore.setState({
			roomId,
			loading: true,
			messages: [],
			marked: null,
		}),
	);
	module.on(loadHistory.success, (messages) =>
		messagesStore.setState({
			loading: false,
			messages: messages.map(
				(message): ChatMessage => ({ ...message, state: "delivered" }),
			),
		}),
	);
	module.on(loadHistory.fail, () => messagesStore.setState({ loading: false }));
	module.on(loadHistory.cancel, () =>
		messagesStore.setState({ loading: false }),
	);

	// the outcomes of a send: the message is shown at once, then delivered or failed
	module.on(sendMessage.pending, (call) =>
		messagesStore.setState((state) => {
			const optimistic: ChatMessage = {
				id: call.localId,
				roomId: call.roomId,
				author: "me",
				text: call.text,
				state: "sending",
			};
			return { messages: [...state.messages, optimistic] };
		}),
	);
	module.on(sendMessage.success, ({ localId, message }) =>
		messagesStore.setState((state) => ({
			messages: changeMessage(state.messages, localId, {
				...message,
				state: "delivered",
			}),
		})),
	);
	module.on(sendMessage.fail, (error) => {
		if (error instanceof SendFailed) {
			const { localId } = error;
			messagesStore.setState((state) => ({
				messages: changeMessage(state.messages, localId, { state: "failed" }),
			}));
		}
	});
	// cancel — the task was aborted: what was still sending will not arrive
	module.on(sendMessage.cancel, () =>
		messagesStore.setState((state) => ({
			messages: state.messages.map(
				(message): ChatMessage =>
					message.state === "sending"
						? { ...message, state: "failed" }
						: message,
			),
		})),
	);

	// an incoming message joins the open room only
	module.on(messageReceived, (message) =>
		messagesStore.setState((state) =>
			message.roomId === state.roomId
				? { messages: [...state.messages, { ...message, state: "delivered" }] }
				: {},
		),
	);

	module.on(messageMarked, (id) => messagesStore.setState({ marked: id }));
});
