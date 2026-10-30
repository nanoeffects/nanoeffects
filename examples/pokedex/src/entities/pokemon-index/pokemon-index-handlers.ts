import type { WithSignal } from "nanoeffects";
import { retry, timeout } from "nanoeffects/effects";
import { api, isWorthRetrying } from "../../shared/api";

// The work of the pokemon-index entity.

// The request for the list. It gets the signal from the task, so an abort cancels the request.
// The first argument is the payload of the task; there is none, so it is not used.
const load = (_: unknown, { signal }: WithSignal) =>
	api.listPokemonNames({ signal });

// retry — try the request again, up to 3 attempts, 300 ms apart, unless the answer was a "no"
// timeout — all the attempts together may take 10 s
export const fetchNames = timeout(
	10000,
	retry(load, { times: 3, delay: 300, shouldRetry: isWorthRetrying }),
);
