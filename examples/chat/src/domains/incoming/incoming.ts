import { createAction } from "nanoeffects/actions";
import type { Message } from "../../api";

// createAction — a message that arrived from outside. This file imports no bus.
export const messageReceived = createAction<Message>("incoming/received");
