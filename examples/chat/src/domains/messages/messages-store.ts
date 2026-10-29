import { createStore } from "zustand/vanilla";
import type { Message } from "../../api";

export type ChatMessage = Message & {
	state: "sending" | "delivered" | "failed";
};

export type MessagesState = {
	roomId: string | null;
	loading: boolean;
	messages: ChatMessage[];
	marked: string | null;
};

export const messagesStore = createStore<MessagesState>(() => ({
	roomId: null,
	loading: false,
	messages: [],
	marked: null,
}));
