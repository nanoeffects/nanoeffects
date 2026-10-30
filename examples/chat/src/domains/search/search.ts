import { createCommand, createJob } from "nanoeffects/actions";
import type { Message } from "../../api";

// The events of the search domain. This file imports no bus.

export type SearchResult = { hits: Message[]; skipped: string[] };

// createJob — a search; its outcomes drive "searching" and the list of hits
export const searchMessages = createJob<string, SearchResult>("search/run");

// createCommand — an order for this domain: open one hit. The search module answers it.
export const openResult = createCommand<Message>("search/openResult");
