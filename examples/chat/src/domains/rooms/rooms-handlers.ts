import { api } from "../../api";

// the work of the rooms domain: it gets the signal from the task, so it needs no bus
export const fetchRooms = (_: unknown, { signal }: { signal: AbortSignal }) =>
	api.loadRooms({ signal });
