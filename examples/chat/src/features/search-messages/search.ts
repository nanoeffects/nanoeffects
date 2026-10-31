import { createAction, createJob } from "nanoeffects/actions";
import type { Message } from "../../shared/api";
import { goToResult } from "./search-handlers";

// The events of the search-messages feature. This file imports no bus.

export type SearchResult = { hits: Message[]; skipped: string[] };

// createJob — a search; its outcomes drive "searching" and the list of hits
export const searchMessages = createJob<string, SearchResult>("search/run");

// createAction — an order for this feature, with the handler that does it: open one hit. The
// search module binds it with module.use.
export const openResult = createAction("search/openResult", goToResult);
