import type {
	EventKey,
	EventLike,
	EventPayload,
	Handler,
	WithType,
} from "./bus";
import type { EventMap } from "./types";

export const eventKey = <K extends string>(event: K | WithType<K>): K =>
	typeof event === "string" ? event : event.type;

export const eventPayload = <E extends EventMap>(
	event: EventKey<E> | Handler<E> | EventLike<E>,
	payload?: EventPayload<E>,
): EventPayload<E> => {
	const data = typeof event === "object" ? event.payload : payload;

	return data as EventPayload<E>;
};
