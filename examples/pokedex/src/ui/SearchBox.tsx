import { findPokemon, pickRandom } from "../entities/pokemon/pokemon";
import { bus } from "../shared/bus";

export function SearchBox() {
	function handleInput(value: string) {
		if (value.trim() !== "") {
			// bus.emit — start the search job; the pokemon entity waits for quiet and aborts the older one
			bus.emit(findPokemon(value));
		}
	}

	return (
		<p>
			<input
				placeholder="A name or a number (pikachu, 25)"
				autoComplete="off"
				onChange={(event) => handleInput(event.target.value)}
			/>{" "}
			{/* bus.emit — the pokemon entity drops a second click while the first search runs */}
			<button type="button" onClick={() => bus.emit(pickRandom())}>
				Random
			</button>
		</p>
	);
}
