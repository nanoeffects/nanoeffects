import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import type { Message } from "../../shared/api";
import type { SendCall, Sent } from "./message";

export type ChatMessage = Message & {
	state: "sending" | "delivered" | "failed";
};

type MessagesState = {
	roomId: string | null;
	loading: boolean;
	messages: ChatMessage[];
	marked: string | null;
};

// What can be done to the state. A module calls these with data; nothing else writes the state.
type MessagesMutations = {
	startLoading: (roomId: string) => void;
	showHistory: (messages: Message[]) => void;
	stopLoading: () => void;
	addSending: (call: SendCall) => void;
	markDelivered: (sent: Sent) => void;
	markFailed: (localId: string) => void;
	failEverythingSending: () => void;
	addReceived: (message: Message) => void;
	mark: (messageId: string) => void;
};

// The immer middleware lets a mutation change the state in place: `state.messages.push(...)` is
// shorter than building a new list. The store still hands out a new object, so React renders again.
// A mutation that sets plain values can give `set` an object instead, as in `set({ loading: false })`.
export const messageStore = createStore<MessagesState & MessagesMutations>()(
	immer((set) => ({
		roomId: null,
		loading: false,
		messages: [],
		marked: null,

		startLoading: (roomId) =>
			set((state) => {
				state.roomId = roomId;
				state.loading = true;
				state.messages = [];
				state.marked = null;
			}),

		showHistory: (messages) =>
			set((state) => {
				state.loading = false;
				state.messages = messages.map((message) => ({
					...message,
					state: "delivered",
				}));
			}),

		stopLoading: () =>
			set((state) => {
				state.loading = false;
			}),

		// the message is shown at once, before the server has answered
		addSending: (call) =>
			set((state) => {
				state.messages.push({
					id: call.localId,
					roomId: call.roomId,
					author: "me",
					text: call.text,
					state: "sending",
				});
			}),

		// the server answered: the message takes the server's data and counts as delivered
		markDelivered: ({ localId, message }) =>
			set((state) => {
				const sent = state.messages.find((item) => item.id === localId);
				if (sent) {
					Object.assign(sent, message, { state: "delivered" });
				}
			}),

		markFailed: (localId) =>
			set((state) => {
				const failed = state.messages.find((item) => item.id === localId);
				if (failed) {
					failed.state = "failed";
				}
			}),

		// the task was aborted: what was still sending will not arrive
		failEverythingSending: () =>
			set((state) => {
				for (const message of state.messages) {
					if (message.state === "sending") {
						message.state = "failed";
					}
				}
			}),

		// an incoming message joins the open room only
		addReceived: (message) =>
			set((state) => {
				if (message.roomId === state.roomId) {
					state.messages.push({ ...message, state: "delivered" });
				}
			}),

		mark: (messageId) => set({ marked: messageId }),
	})),
);
