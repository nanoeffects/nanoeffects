import type { WithSignal } from "nanoeffects";

const base = "https://rickandmortyapi.com/api";

export type Status = "alive" | "dead" | "unknown";

export type Character = {
	id: number;
	name: string;
	status: string;
	species: string;
	image: string;
	episode: string[];
};

export type Episode = { id: number; name: string; episode: string };

export type CharactersPage = {
	info: { pages: number };
	results: Character[];
};

export class HttpError extends Error {
	status: number;

	constructor(status: number) {
		super(`Rick and Morty API answered ${status}`);
		this.status = status;
	}
}

const get = async <T>(path: string, signal: AbortSignal) => {
	const response = await fetch(`${base}${path}`, { signal });

	if (!response.ok) {
		throw new HttpError(response.status);
	}

	const data: T = await response.json();
	return data;
};

export type CharactersQuery = {
	name: string;
	status: Status | "";
	page: number;
};

// A page of characters. The API answers 404 when nothing matches.
export const getCharacters = (
	{ name, status, page }: CharactersQuery,
	{ signal }: WithSignal,
) => {
	const params = new URLSearchParams({ name, status, page: String(page) });
	return get<CharactersPage>(`/character/?${params}`, signal);
};

// Episodes by id in one request. For one id the API sends an object, for several an array.
export const getEpisodes = async (ids: number[], { signal }: WithSignal) => {
	const data = await get<Episode | Episode[]>(
		`/episode/${ids.join(",")}`,
		signal,
	);
	return Array.isArray(data) ? data : [data];
};
