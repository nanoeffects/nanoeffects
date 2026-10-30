import type { WithSignal } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { retry, timeout } from "nanoeffects/effects";
import { debounce, latest } from "nanoeffects/policies";

export type Spell = { spell: string; use: string; index: number };

// One request to PotterAPI (https://potterapi-fedeperin.vercel.app). It gets the signal from the
// task, so an abort cancels the request in the browser. An empty search gives all the spells, and a
// word with no match gives an empty list, so there is no status to tell apart.
const load = async (query: string, { signal }: WithSignal) => {
	const url = `https://potterapi-fedeperin.vercel.app/en/spells?search=${encodeURIComponent(query)}`;
	const response = await fetch(url, { signal });

	if (!response.ok) {
		throw new Error(`PotterAPI answered ${response.status}`);
	}

	const spells: Spell[] = await response.json();
	return spells;
};

// createCommand — a call that returns a result, with the handler that does it. The handler is read
// from the inside out:
// retry — try a failed request again, up to 3 attempts, 300 ms apart
// timeout — all the attempts together may take 5 s
// latest — a newer search aborts the older one
// debounce — wait 300 ms of quiet before a search starts
// bus.emit(searchSpells(query)) gives back the spells, or undefined when the call was dropped or replaced.
export const searchSpells = createCommand(
	"spells/search",
	debounce(300, latest(timeout(5000, retry(load, { times: 3, delay: 300 })))),
);
