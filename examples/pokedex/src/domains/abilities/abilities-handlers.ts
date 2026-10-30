import type { WithSignal } from "nanoeffects";
import { allSettled, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import { type AbilityText, api } from "../../api";

// The work of the abilities domain.

// One ability: the request, limited to 3 s. A request that does not answer in time fails with a
// timeout error, and the request is aborted.
const askAbility = (name: string) => {
	const request = ({ signal }: WithSignal) =>
		api.getAbilityText(name, { signal });

	return (parent: WithSignal) => timeout(parent, 3000, request);
};

// latest — the abilities of a newer pokémon abort the load of the older one
export const loadAbilityTexts = latest(async (names: string[], ctx) => {
	// allSettled — ask every ability at once and wait for all of them, however each one ends
	const outcomes = await allSettled(ctx, names.map(askAbility));

	const texts: AbilityText[] = [];
	for (const [index, name] of names.entries()) {
		const outcome = outcomes[index];
		texts.push({
			name,
			text: outcome?.status === "fulfilled" ? outcome.value : null,
		});
	}

	return texts;
});
