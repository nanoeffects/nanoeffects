import { createAction } from "nanoeffects/actions";

export type Line = { from: "user" | "bot" | "operator"; text: string };

// an action without a handler is an event: any number of listeners can hear it
export const messageSent = createAction<string>("chat/sent"); // the user wrote a text
export const messageAdded = createAction<Line>("chat/messageAdded"); // a line of the conversation
export const typingChanged = createAction<boolean>("chat/typing"); // true while the bot answers
export const closeRequested = createAction("chat/closeRequested"); // Escape was pressed
