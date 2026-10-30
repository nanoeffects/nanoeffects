import { useStore } from "zustand";
import { abilitiesStore } from "../domains/abilities/abilities-store";

export function Abilities() {
	const { loading, items } = useStore(abilitiesStore);

	if (loading) {
		return <p className="hint">Loading the abilities…</p>;
	}

	return (
		<ul>
			{items.map((ability) => (
				<li key={ability.name}>
					<b>{ability.name}</b>: {ability.text ?? "did not arrive"}
				</li>
			))}
		</ul>
	);
}
