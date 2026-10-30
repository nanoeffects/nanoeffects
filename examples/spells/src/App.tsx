import { useCallback, useEffect, useState } from "react";
import { bus } from "./bus";
import { type Spell, searchSpells } from "./spells";

export function App() {
	const [spells, setSpells] = useState<Spell[]>([]);
	const [error, setError] = useState("");
	// the number of searches that have not settled yet: loading is "more than none"
	const [inFlight, setInFlight] = useState(0);

	// useCallback — one function for the life of the component, so the effect below runs once
	const search = useCallback(async (query: string) => {
		setInFlight((count) => count + 1);
		try {
			// bus.emit — run the command and wait for its result
			const found = await bus.emit(searchSpells(query));

			// undefined: the call was dropped by the quiet time or replaced by a newer one
			if (found) {
				setSpells(found);
				setError("");
			}
		} catch {
			setError("PotterAPI did not answer, try again");
		} finally {
			// a call that is dropped settles at once; counting keeps "loading" on for the one that runs
			setInFlight((count) => count - 1);
		}
	}, []);

	// an empty search gives all the spells: show them before the reader types
	useEffect(() => {
		search("");
	}, [search]);

	return (
		<>
			<h1>A search for spells</h1>
			<p className="hint">
				Real requests to PotterAPI. Type fast: one request starts after 300 ms
				of quiet and a newer one cancels the older.
			</p>
			<input
				placeholder="Type a spell (lum, accio)"
				autoComplete="off"
				onChange={(event) => search(event.target.value)}
			/>
			{inFlight > 0 && <p className="hint">Searching…</p>}
			{error && <p className="failed">{error}</p>}
			{spells.length === 0 && inFlight === 0 && !error && (
				<p className="hint">No such spell.</p>
			)}
			<ul>
				{spells.map((spell) => (
					<li key={spell.index}>
						<b>{spell.spell}</b>: {spell.use}
					</li>
				))}
			</ul>
		</>
	);
}
