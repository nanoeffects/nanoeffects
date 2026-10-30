import { bus } from "../bus";
import { findPokemon, pickRandom } from "../domains/pokemon/pokemon";

export function SearchBox() {
	function handleInput(value: string) {
		if (value.trim() !== "") {
			// bus.emit — start the search job; the pokemon domain waits for quiet and aborts the older one
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
			{/* bus.emit — the domain drops a second click while the first search runs */}
			<button type="button" onClick={() => bus.emit(pickRandom())}>
				Random
			</button>
		</p>
	);
}
