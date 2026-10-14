import type { WithType } from "./bus";

export const eventKey = <K extends string>(event: K | WithType<K>): K =>
	typeof event === "string" ? event : event.type;
