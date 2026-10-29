import { createAction, createJob } from "nanoeffects/actions";
import type { Message } from "../../api";

// The events of the search domain. This file imports no bus.

export type SearchResult = { hits: Message[]; skipped: string[] };

// createJob — a search; its outcomes drive "searching" and the list of hits
export const searchMessages = createJob<string, SearchResult>("search/run");

// createAction — the reader opened one hit
export const resultOpened = createAction<Message>("search/resultOpened");
