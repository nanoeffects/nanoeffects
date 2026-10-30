// The client of PokeAPI (https://pokeapi.co): one function per request. Every function takes the
// `signal` of the task that asks, so aborting the task also cancels the request in the browser.
import type { WithSignal } from "nanoeffects";

export type Pokemon = {
	id: number;
	name: string;
	sprite: string;
	types: string[];
	abilities: string[];
};

// The text of an ability, or null when its request failed or was too slow
export type AbilityText = { name: string; text: string | null };

// An answer with a status of 400 or more. `status` lets a caller tell "no such pokémon" (404)
// from a server that is busy (503).
export class HttpError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

// only the fields that the page uses
type PokemonAnswer = {
	id: number;
	name: string;
	sprites: { front_default: string | null };
	types: { type: { name: string } }[];
	abilities: { ability: { name: string } }[];
};

type NamesAnswer = { results: { name: string }[] };

type AbilityAnswer = {
	effect_entries: { short_effect: string; language: { name: string } }[];
};

const request = async <T>(path: string, { signal }: WithSignal): Promise<T> => {
	const response = await fetch(`https://pokeapi.co/api/v2${path}`, { signal });

	if (!response.ok) {
		throw new HttpError(response.status, response.statusText);
	}

	return response.json();
};

// A 404 is an answer: asking again gives the same answer. A busy server or a lost connection may pass.
export const isWorthRetrying = (error: unknown) =>
	!(error instanceof HttpError && error.status < 500);

export const api = {
	// `query` is a name or a number
	async getPokemon(query: string, options: WithSignal): Promise<Pokemon> {
		const name = encodeURIComponent(query.trim().toLowerCase());
		const answer = await request<PokemonAnswer>(`/pokemon/${name}`, options);

		return {
			id: answer.id,
			name: answer.name,
			sprite: answer.sprites.front_default ?? "",
			types: answer.types.map((entry) => entry.type.name),
			abilities: answer.abilities.map((entry) => entry.ability.name),
		};
	},

	// Every name in one request (about 1300), so the page can suggest names without asking per key press
	async listPokemonNames(options: WithSignal): Promise<string[]> {
		const answer = await request<NamesAnswer>(
			"/pokemon?limit=100000&offset=0",
			options,
		);

		return answer.results.map((entry) => entry.name);
	},

	async getAbilityText(name: string, options: WithSignal): Promise<string> {
		const answer = await request<AbilityAnswer>(`/ability/${name}`, options);
		const english = answer.effect_entries.find(
			(entry) => entry.language.name === "en",
		);

		return english?.short_effect ?? "No description in English";
	},
};
