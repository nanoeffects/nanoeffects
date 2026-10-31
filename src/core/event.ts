import type { Emittable, EventPayload, WithType } from "./bus";
import type { EventMap } from "./types";

// a string has no `type`, so it is its own key; an object, a creator or a command has one
export const eventKey = <K extends string>(event: K | WithType<K>): K =>
	(event as WithType<K>).type ?? (event as K);

export const eventPayload = <E extends EventMap>(
	event: Emittable<E>,
	payload?: EventPayload<E>,
): EventPayload<E> => {
	const data = typeof event === "object" ? event.payload : payload;

	return data as EventPayload<E>;
};
