import type { WithSignal } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { retry, timeout } from "nanoeffects/effects";
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
