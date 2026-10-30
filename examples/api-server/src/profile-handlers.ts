import type { Context, EventMap, WithSignal } from "nanoeffects";
import { allSettled, retry, timeout } from "nanoeffects/effects";
import type { Profile, ProfileAbility } from "./profile";
import { isWorthRetrying, type Upstream } from "./upstream";

// The work of the profile command.

export const profileHandler = (upstream: Upstream) => {
	// One request for the pokémon. It gets the signal from the task, so an abort cancels the request.
	const load = (name: string, { signal }: WithSignal) =>
		upstream.getPokemon(name, { signal });

	// Read from the inside out:
	// retry — try the request again, up to 3 attempts, 300 ms apart, unless the answer was a "no"
	// timeout — all the attempts together may take 8 s
	const loadPokemon = timeout(
		8000,
		retry(load, { times: 3, delay: 300, shouldRetry: isWorthRetrying }),
	);

	// One ability: the request, limited to 3 s. The starter gets its own child, so cancelling the
	// group stops exactly this request.
	const askAbility = (name: string) => {
		const request = ({ signal }: WithSignal) =>
			upstream.getAbilityText(name, { signal });

		return (child: WithSignal) => timeout(child, 3000, request);
	};

	return async (name: string, ctx: Context<EventMap>): Promise<Profile> => {
		const pokemon = await loadPokemon(name, ctx);

		// allSettled — ask every ability at once and wait for all of them, however each one ends
		const outcomes = await allSettled(ctx, pokemon.abilities.map(askAbility));

		const abilities: ProfileAbility[] = [];
		for (const [index, abilityName] of pokemon.abilities.entries()) {
			const outcome = outcomes[index];
			abilities.push({
				name: abilityName,
				text: outcome?.status === "fulfilled" ? outcome.value : null,
			});
		}

		return { name: pokemon.name, types: pokemon.types, abilities };
	};
};
