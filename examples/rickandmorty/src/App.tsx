import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import type { Character, CharactersQuery, Status } from "./api";
import { bus } from "./bus";
import { findCharacters, loadEpisodes } from "./characters";

type Filter = Omit<CharactersQuery, "page">;

const idOf = (url: string) => Number(url.split("/").at(-1));

function Episodes({ character }: { character: Character }) {
	const ids = character.episode.map(idOf);
	// useQuery — the cache and the state; queryFn — the request is a command, and React Query's signal
	// goes to bus.emit, so closing the panel cancels it
	const episodes = useQuery({
		queryKey: ["episodes", character.id],
		queryFn: ({ signal }) => bus.emit(loadEpisodes(ids), { signal }),
	});

	return (
		<aside>
			<h3>{character.name}</h3>
			<p className="hint">
				{character.species}, {character.status}
			</p>
			{episodes.isPending && <p>Loading episodes…</p>}
			{episodes.isError && <p className="failed">{episodes.error.message}</p>}
			<ul>
				{episodes.data?.map((episode) => (
					<li key={episode.id}>
						{episode.episode}: {episode.name}
					</li>
				))}
			</ul>
		</aside>
	);
}

export function App() {
	const [filter, setFilter] = useState<Filter>({ name: "", status: "" });
	const [selected, setSelected] = useState<Character>();
	const characters = useInfiniteQuery({
		queryKey: ["characters", filter],
		initialPageParam: 1,
		// the request is a command; a new filter changes the key and React Query aborts the old one
		queryFn: ({ pageParam, signal }) =>
			bus.emit(findCharacters({ ...filter, page: pageParam }), { signal }),
		getNextPageParam: (last, pages) =>
			last && pages.length < last.info.pages ? pages.length + 1 : void 0,
	});

	const search = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setFilter({
			name: String(form.get("name")),
			status: String(form.get("status")) as Status | "",
		});
	};

	// a page is undefined only when the call was dropped, which this command never is
	const pages = characters.data?.pages ?? [];
	const found = pages.flatMap((page) => page?.results ?? []);

	return (
		<>
			<h1>Rick and Morty</h1>
			<form onSubmit={search}>
				<input name="name" placeholder="Name, then Enter" />
				<select name="status">
					<option value="">any status</option>
					<option value="alive">alive</option>
					<option value="dead">dead</option>
					<option value="unknown">unknown</option>
				</select>
				<button type="submit">Search</button>
			</form>
			{characters.isPending && <p>Loading…</p>}
			{characters.isError && (
				<p className="failed">{characters.error.message}</p>
			)}
			{characters.isSuccess && found.length === 0 && (
				<p className="hint">Nobody found.</p>
			)}
			<ul>
				{found.map((character) => (
					<li key={character.id}>
						<img src={character.image} alt="" />
						<button type="button" onClick={() => setSelected(character)}>
							{character.name}
						</button>
						<span className="hint">{character.status}</span>
					</li>
				))}
			</ul>
			{characters.hasNextPage && (
				<button
					type="button"
					disabled={characters.isFetchingNextPage}
					onClick={() => characters.fetchNextPage()}
				>
					Load more
				</button>
			)}
			{selected && <Episodes key={selected.id} character={selected} />}
		</>
	);
}
