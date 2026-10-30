import { useStore } from "zustand";
import { pokemonStore } from "../entities/pokemon/pokemon-store";

export function PokemonCard() {
	// useStore — read a Zustand store; the component renders again when the store changes
	const { status, pokemon, message } = useStore(pokemonStore);

	if (status === "loading") {
		return <p className="card">Looking for it…</p>;
	}
	if (status === "failed") {
		return <p className="card failed">{message}</p>;
	}
	if (!pokemon) {
		return <p className="card hint">Type a name, or press Random.</p>;
	}

	return (
		<div className="card">
			<img src={pokemon.sprite} alt={pokemon.name} />
			<div>
				<h2>
					#{pokemon.id} {pokemon.name}
				</h2>
				<p>{pokemon.types.join(", ")}</p>
			</div>
		</div>
	);
}
