import type { Context } from "./bus";
import type { EventMap } from "./types";

export type Task<P, E extends EventMap, R = unknown> = (
	payload: P,
	ctx: Context<E>,
) => R;
