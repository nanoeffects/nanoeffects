import type { WithSignal } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { retry, timeout } from "nanoeffects/effects";
import { debounce, latest } from "nanoeffects/policies";
import {
	type CharactersPage,
	type CharactersQuery,
	getCharacters,
	getEpisodes,
	HttpError,
} from "./api";

const nothingFound: CharactersPage = { info: { pages: 0 }, results: [] };

// A 404 is an answer, not a failure: repeating it would only wait. Network errors and 5xx are repeated.
const isFailure = (error: unknown) =>
	!(error instanceof HttpError && error.status < 500);

const load = async (query: CharactersQuery, { signal }: WithSignal) => {
	try {
		return await getCharacters(query, { signal });
	} catch (error) {
		if (error instanceof HttpError && error.status === 404) {
			return nothingFound;
		}
		throw error;
	}
};

// createCommand — a call that returns a result, with the handler that does it.
// retry — try a failed request again, up to 3 attempts, 300 ms apart, but not after an answer below 500
// timeout — all the attempts together may take 8 s
// bus.emit(findCharacters(query), { signal }) gives back a page of characters; no match gives an empty page.
export const findCharacters = createCommand(
	"characters/find",
	timeout(8000, retry(load, { times: 3, delay: 300, shouldRetry: isFailure })),
);

// The episodes of one character, in one request
export const loadEpisodes = createCommand(
	"characters/episodes",
	timeout(
		8000,
		retry(getEpisodes, { times: 3, delay: 300, shouldRetry: isFailure }),
	),
);

// The names for the suggestions under the search box: the first 5 different names of page 1. `load`
// turns a 404 into an empty page, so no match is an empty list.
const suggest = async (text: string, { signal }: WithSignal) => {
	// a blank text asks for nothing: the call still replaces an older one that waits for quiet
	if (text.trim() === "") {
		return [];
	}

	const page = await load({ name: text, status: "", page: 1 }, { signal });
	const names = new Set(page.results.map((character) => character.name));

	return [...names].slice(0, 5);
};

// createCommand — a call that returns a result, with the handler that does it. The suggestions are
// not cached by React Query: they live for a few key presses and belong to one input.
// timeout — a suggestion that takes over 4 s is not worth showing
// latest — a newer text aborts the older request
// debounce — wait 250 ms of quiet before a request starts
// There is no retry: a lost suggestion costs nothing, the next key press asks again.
// bus.emit(suggestCharacters(text)) gives back the names, or undefined when the call was dropped or replaced.
export const suggestCharacters = createCommand(
	"characters/suggest",
	debounce(250, latest(timeout(4000, suggest))),
);
