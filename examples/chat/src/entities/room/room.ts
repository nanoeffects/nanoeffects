import { createAction, createJob } from "nanoeffects/actions";
import type { Room } from "../../shared/api";

// The events of the room entity: its contract with the rest of the app. This file imports no bus.

// createAction<Payload> — an event with a name and the type of its payload
export const roomSelected = createAction<string>("rooms/selected");

// createJob — a command that also sends pending, success, fail and cancel
export const loadRooms = createJob<void, Room[]>("rooms/load");
