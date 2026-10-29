// The client of the chat server: one function per request. Every function takes the `signal` of
// the task that asks, so aborting the task also cancels the request in the browser.
export type Room = { id: string; name: string };
export type Message = {
	id: string;
	roomId: string;
	author: string;
	text: string;
};
export type Updates = { seq: number; messages: Message[] };

// The chat has these rooms; they are the same as on the server. The search asks each of them.
export const rooms: Room[] = [
	{ id: "general", name: "General" },
	{ id: "random", name: "Random" },
	{ id: "help", name: "Help" },
];

// An answer with a status of 400 or more. `status` lets a caller tell "try again" (503) from "no" (400).
export class HttpError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

type Options = { signal: AbortSignal };

const request = async <T>(
	path: string,
	init: RequestInit & Options,
): Promise<T> => {
	const response = await fetch(`/api${path}`, init);

	if (!response.ok) {
		const body: { error?: string } = await response.json().catch(() => ({}));
		throw new HttpError(response.status, body.error ?? response.statusText);
	}

	return response.json();
};

export const api = {
	loadRooms: (options: Options) => request<Room[]>("/rooms", options),

	loadHistory: (roomId: string, options: Options) =>
		request<Message[]>(`/rooms/${roomId}/messages`, options),

	send: (roomId: string, text: string, { signal }: Options) =>
		request<Message>(`/rooms/${roomId}/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text }),
			signal,
		}),

	searchRoom: (roomId: string, query: string, options: Options) =>
		request<Message[]>(
			`/search?room=${roomId}&q=${encodeURIComponent(query)}`,
			options,
		),

	// `since` is the number of the last update the client has seen; without it the server only
	// says where it is now
	loadUpdates: (since: number | undefined, options: Options) =>
		request<Updates>(
			typeof since === "number" ? `/updates?since=${since}` : "/updates",
			options,
		),
};
