import type { Context, EventMap } from "nanoeffects";
import { api } from "../../shared/api";

// The work of the room entity. It gets the signal from the context of its task, so it needs no bus.
// The first argument is the payload of the task; there is none, so it is not used.
export const fetchRooms = (_: unknown, ctx: Context<EventMap>) =>
	api.loadRooms({ signal: ctx.signal });
