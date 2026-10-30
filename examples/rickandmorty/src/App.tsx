import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	type ChangeEvent,
	type FormEvent,
	type KeyboardEvent,
	useRef,
	useState,
} from "react";
import type { Character, CharactersQuery, Status } from "./api";
import { bus } from "./bus";
import { findCharacters, loadEpisodes, suggestCharacters } from "./characters";

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
	const [name, setName] = useState("");
	const [status, setStatus] = useState<Status | "">("");
	const [filter, setFilter] = useState<Filter>({ name: "", status: "" });
	const [selected, setSelected] = useState<Character>();
	// the suggestions under the box are state of this component, not of React Query
	const [suggestions, setSuggestions] = useState<string[]>([]);
	// the suggestion that the arrow keys point at; -1 is none
	const [highlighted, setHighlighted] = useState(-1);
	// the text now in the box, so a late answer for an older text is not shown
	const typed = useRef("");
	const characters = useInfiniteQuery({
		queryKey: ["characters", filter],
		initialPageParam: 1,
		// the request is a command; a new filter changes the key and React Query aborts the old one
		queryFn: ({ pageParam, signal }) =>
			bus.emit(findCharacters({ ...filter, page: pageParam }), { signal }),
		getNextPageParam: (last, pages) =>
			last && pages.length < last.info.pages ? pages.length + 1 : void 0,
	});

	const closeSuggestions = () => {
		setSuggestions([]);
		setHighlighted(-1);
	};

	const search = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		closeSuggestions();
		setFilter({ name, status });
	};

	const choose = (chosen: string) => {
		typed.current = chosen;
		setName(chosen);
		closeSuggestions();
		// the same filter as the form sets, so the query below runs as for a submit
		setFilter({ name: chosen, status });
	};

	const suggest = async (text: string) => {
		typed.current = text;
		setName(text);
		setHighlighted(-1);

		if (text.trim() === "") {
			closeSuggestions();
		}

		// bus.emit — ask the command for names; it waits for quiet and keeps the newest request.
		// A blank text is sent too: it replaces a call that waits for quiet, and asks for nothing.
		const names = await bus.emit(suggestCharacters(text));

		// undefined: the call was dropped or replaced by a newer one
		if (names && typed.current === text) {
			setSuggestions(names);
		}
	};

	const changeStatus = (event: ChangeEvent<HTMLSelectElement>) => {
		const chosen = event.target.value as Status | "";
		setStatus(chosen);
	};

	const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
		const count = suggestions.length;
		if (event.key === "ArrowDown" && count > 0) {
			event.preventDefault();
			setHighlighted((index) => (index + 1) % count);
		} else if (event.key === "ArrowUp" && count > 0) {
			event.preventDefault();
			setHighlighted((index) => (index <= 0 ? count - 1 : index - 1));
		} else if (event.key === "Enter" && highlighted >= 0) {
			event.preventDefault();
			choose(suggestions[highlighted] ?? name);
		} else if (event.key === "Escape") {
			closeSuggestions();
		}
	};

	// a page is undefined only when the call was dropped, which this command never is
	const pages = characters.data?.pages ?? [];
	const found = pages.flatMap((page) => page?.results ?? []);

	return (
		<>
			<h1>Rick and Morty</h1>
			<form onSubmit={search}>
				<span className="combo">
					<input
						name="name"
						role="combobox"
						aria-expanded={suggestions.length > 0}
						aria-controls="suggestions"
						aria-activedescendant={
							highlighted >= 0 ? `suggestion-${highlighted}` : void 0
						}
						placeholder="Name, then Enter"
						autoComplete="off"
						value={name}
						onChange={(event) => suggest(event.target.value)}
						onKeyDown={handleKey}
					/>
					{suggestions.length > 0 && (
						<div className="options" id="suggestions" role="listbox">
							{suggestions.map((suggestion, index) => (
								<div
									key={suggestion}
									className="option"
									id={`suggestion-${index}`}
									role="option"
									tabIndex={-1}
									aria-selected={index === highlighted}
									// onMouseDown — choose before the input loses focus and closes the list
									onMouseDown={(event) => {
										event.preventDefault();
										choose(suggestion);
									}}
								>
									{suggestion}
								</div>
							))}
						</div>
					)}
				</span>
				<select name="status" value={status} onChange={changeStatus}>
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
