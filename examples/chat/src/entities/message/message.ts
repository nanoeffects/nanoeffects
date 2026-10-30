import { createAction, createCommand, createJob } from "nanoeffects/actions";
import type { Message } from "../../shared/api";
import { messageStore } from "./message-store";

// The events of the message entity. This file imports no bus.

export type SendCall = { localId: string; roomId: string; text: string };
export type Sent = { localId: string; message: Message };

// createAction — a message that arrived from outside. The feature that asks the server for new
// messages emits it; this entity adds it to the list.
export const messageReceived = createAction<Message>("incoming/received");

// createJob<Payload, Result> — the history of a room; its outcomes drive the loading state
export const loadHistory = createJob<string, Message[]>("messages/loadHistory");

// createJob — sending a message; the local id lets the page tell which message an outcome is about
export const sendMessage = createJob<SendCall, Sent>("messages/send");

// createCommand — an order for this entity, with the handler that does it: mark one message, for
// example the one a search result points to. It works whenever it is called; the module binds it
// with module.use for as long as the module is mounted.
export const markMessage = createCommand("messages/mark", (messageId: string) =>
	messageStore.getState().mark(messageId),
);
