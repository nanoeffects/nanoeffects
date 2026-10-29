import { createAction, createJob } from "nanoeffects/actions";
import type { Message } from "../../api";

// The events of the messages domain. This file imports no bus.

export type SendCall = { localId: string; roomId: string; text: string };
export type Sent = { localId: string; message: Message };

// createJob<Payload, Result> — the history of a room; its outcomes drive the loading state
export const loadHistory = createJob<string, Message[]>("messages/loadHistory");

// createJob — sending a message; the local id lets the page tell which message an outcome is about
export const sendMessage = createJob<SendCall, Sent>("messages/send");

// createAction — mark one message, for example the one a search result points to
export const messageMarked = createAction<string>("messages/marked");
