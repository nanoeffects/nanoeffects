import { Abilities } from "./Abilities";
import { PokemonCard } from "./PokemonCard";
import { SearchBox } from "./SearchBox";

export function App() {
	return (
		<>
			<h1>A pokédex with PokeAPI</h1>
			<p className="hint">
				Real requests to pokeapi.co. Type to see suggestions, then pick one or
				press Enter: the search waits 400 ms of quiet and a newer one aborts the
				older. An unknown name is a 404 that is not tried again.
			</p>
			<SearchBox />
			<PokemonCard />
			<Abilities />
		</>
	);
}
