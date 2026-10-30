import { useState } from "react";
import { useStore } from "zustand";
import { bus, useEmitter } from "../bus";
import { openResult, searchMessages } from "../domains/search/search";
import { searchStore } from "../domains/search/search-store";

export function SearchBox() {
	const [query, setQuery] = useState("");
	const { searching, hits, skipped } = useStore(searchStore);

	useEmitter(searchMessages, query);

	return (
		<div className="search">
			<input
				value={query}
				placeholder="Search in every room (try nano)"
				autoComplete="off"
				onChange={(event) => setQuery(event.target.value)}
			/>
			{searching && <p className="hint">Searching…</p>}
			{skipped.length > 0 && (
				<p className="hint">No answer from: {skipped.join(", ")}</p>
			)}
			<ul>
				{hits.map((hit) => (
					<li key={hit.id}>
						{hit.roomId}: {hit.text}{" "}
						<button type="button" onClick={() => bus.emit(openResult(hit))}>
							Open
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
