// The client of PokeAPI (https://pokeapi.co): one function per request. Every function takes the
// `signal` of the task that asks, so aborting the task also cancels the request on the network.
// `fetch` is a parameter, so a test hands in a fake and the code has no global state.
import type { WithSignal } from "nanoeffects";

// An answer with a status of 400 or more. `status` lets a caller tell "no such pokémon" (404)
// from a server that is busy (503).
export class HttpError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

// A 404 is an answer: asking again gives the same answer. A busy server or a lost connection may pass.
export const isWorthRetrying = (error: unknown) =>
	!(error instanceof HttpError && error.status < 500);

export type Pokemon = {
	name: string;
	types: string[];
	abilities: string[];
};

export type Upstream = {
	getPokemon: (name: string, options: WithSignal) => Promise<Pokemon>;
	getAbilityText: (name: string, options: WithSignal) => Promise<string>;
};

// only the fields that the server uses
type PokemonAnswer = {
	name: string;
	types: { type: { name: string } }[];
	abilities: { ability: { name: string } }[];
};

type AbilityAnswer = {
	effect_entries: { short_effect: string; language: { name: string } }[];
};

export const createUpstream = (fetcher: typeof fetch = fetch): Upstream => {
	const request = async <T>(
		path: string,
		{ signal }: WithSignal,
	): Promise<T> => {
		const response = await fetcher(`https://pokeapi.co/api/v2${path}`, {
			signal,
		});

		if (!response.ok) {
			throw new HttpError(response.status, response.statusText);
		}

		return response.json();
	};

	return {
		async getPokemon(name, options) {
			const path = `/pokemon/${encodeURIComponent(name.trim().toLowerCase())}`;
			const answer = await request<PokemonAnswer>(path, options);

			return {
				name: answer.name,
				types: answer.types.map((entry) => entry.type.name),
				abilities: answer.abilities.map((entry) => entry.ability.name),
			};
		},

		async getAbilityText(name, options) {
			const answer = await request<AbilityAnswer>(`/ability/${name}`, options);
			const english = answer.effect_entries.find(
				(entry) => entry.language.name === "en",
			);

			return english?.short_effect ?? "No description in English";
		},
	};
};
