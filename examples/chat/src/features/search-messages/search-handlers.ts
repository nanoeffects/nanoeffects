import type { Context, EventMap, WithSignal } from "nanoeffects";
import { allSettled, take, timeout } from "nanoeffects/effects";
import { debounce, latest } from "nanoeffects/policies";
import { loadHistory, markMessage } from "../../entities/message/message";
import { roomSelected } from "../../entities/room/room";
import { api, type Message, type Room, rooms } from "../../shared/api";
import { searchStore } from "./search-store";

// One room: the request, limited by timeout. A room that does not answer in 1.5 s fails with a
// timeout error, and its request is aborted.
const askRoom = (room: Room, query: string) => {
	const request = ({ signal }: WithSignal) =>
		api.searchRoom(room.id, query, { signal });

	return (parent: WithSignal) => timeout(parent, 1500, request);
};

// debounce — wait 300 ms of quiet; latest — a newer query aborts the older search
export const runSearch = debounce(
	300,
	latest(async (query: string, ctx) => {
		if (query.trim() === "") {
			return { hits: [], skipped: [] };
		}

		// allSettled — ask every room at once and wait for all of them, however each one ends
		const outcomes = await allSettled(
			ctx,
			rooms.map((room) => askRoom(room, query)),
		);

		const hits: Message[] = [];
		const skipped: string[] = [];
		for (const [index, outcome] of outcomes.entries()) {
			if (outcome.status === "fulfilled") {
				hits.push(...outcome.value);
			} else {
				const room = rooms[index];
				if (room) {
					skipped.push(room.name);
				}
			}
		}

		return { hits, skipped };
	}),
);

// Opening a hit in another room selects it and waits for its history; only then the message is marked.
export const goToResult = async (hit: Message, ctx: Context<EventMap>) => {
	if (hit.roomId !== searchStore.getState().selectedRoom) {
		// take — wait for the next event of that name; started before the emit so nothing is missed
		const loaded = take(ctx, loadHistory.success.type);
		ctx.emit(roomSelected(hit.roomId));
		await loaded;
	}
	// ctx.emit with a command — the message entity marks the message
	ctx.emit(markMessage(hit.id));
};
