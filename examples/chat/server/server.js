// The server of the chat example: Fastify, data in memory, and a few rules that make it misbehave
// on a known schedule, so the page has something to survive. `npm run dev` starts it.
//
// The rules (set CHAOS=off to turn them off):
//   - every third send answers 503, "try again"
//   - a send whose text starts with /fail answers 400, "no"
//   - the room "random" answers slowly: its history in 1.2 s, its search in 2.5 s
import Fastify from "fastify";

const chaos = process.env.CHAOS !== "off";

const rooms = [
	{ id: "general", name: "General" },
	{ id: "random", name: "Random" },
	{ id: "help", name: "Help" },
];

const history = {
	general: [
		{ id: "g1", roomId: "general", author: "Ann", text: "Welcome to the chat" },
		{
			id: "g2",
			roomId: "general",
			author: "Bob",
			text: "Try searching for nano",
		},
		{
			id: "g3",
			roomId: "general",
			author: "Ann",
			text: "Switch rooms quickly: the older load is aborted",
		},
	],
	random: [
		{
			id: "r1",
			roomId: "random",
			author: "Bob",
			text: "This room is slow: its search takes 2.5 s",
		},
		{ id: "r2", roomId: "random", author: "Cy", text: "nano nano nano" },
	],
	help: [
		{
			id: "h1",
			roomId: "help",
			author: "Ann",
			text: "Send /fail to see a failed message",
		},
		{
			id: "h2",
			roomId: "help",
			author: "Bob",
			text: "Search skips a room that answers too late",
		},
	],
};

// messages that appear without anyone asking, said in turn
const lines = [
	{ roomId: "general", author: "Bob", text: "Anyone here?" },
	{ roomId: "help", author: "Cy", text: "How do I cancel a request?" },
	{ roomId: "general", author: "Ann", text: "Use latest" },
];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const buildServer = () => {
	const app = Fastify();

	// updates are the messages that appeared on their own; each has a number, so a client can ask
	// "what is new since number 7"
	const updates = [];
	let sentCount = 0;
	let sendRequests = 0;

	// say what the server sees, so a reader can match it with the Network panel of the browser
	app.addHook("onRequest", async (request) => {
		console.log(`${request.method} ${request.url}`);
	});
	app.addHook("onRequestAbort", async (request) => {
		console.log(`aborted: ${request.method} ${request.url}`);
	});

	app.get("/api/rooms", async () => {
		await pause(400);
		return rooms;
	});

	app.get("/api/rooms/:id/messages", async (request) => {
		await pause(chaos && request.params.id === "random" ? 1200 : 500);
		return history[request.params.id] ?? [];
	});

	app.post("/api/rooms/:id/messages", async (request, reply) => {
		await pause(400);
		const { text } = request.body;

		if (text.startsWith("/fail")) {
			reply.code(400);
			return { error: "The server rejected the message" };
		}

		sendRequests += 1;
		if (chaos && sendRequests % 3 === 0) {
			reply.code(503);
			return { error: "The server is busy, try again" };
		}

		sentCount += 1;
		const message = {
			id: `sent-${sentCount}`,
			roomId: request.params.id,
			author: "me",
			text,
		};
		history[request.params.id]?.push(message);
		return message;
	});

	app.get("/api/search", async (request) => {
		const { q, room } = request.query;
		await pause(chaos && room === "random" ? 2500 : 300);
		const needle = q.toLowerCase();
		const messages = history[room] ?? [];
		return messages.filter((message) =>
			message.text.toLowerCase().includes(needle),
		);
	});

	// Without `since` the answer is only the number of the latest update, so a client that
	// starts late does not get old messages again. With it, the answer is what is newer.
	app.get("/api/updates", async (request) => {
		const seq = updates.length;
		const { since } = request.query;
		if (since === void 0) {
			return { seq, messages: [] };
		}
		return { seq, messages: updates.slice(Number(since)) };
	});

	// a new message every 4 s: it is stored in its room and kept as an update
	let said = 0;
	const timer = setInterval(() => {
		const line = lines[said % lines.length];
		said += 1;
		if (line) {
			const message = { ...line, id: `in-${said}` };
			history[line.roomId]?.push(message);
			updates.push(message);
		}
	}, 4000);
	app.addHook("onClose", async () => clearInterval(timer));

	return app;
};

export const startServer = async (port) => {
	const app = buildServer();
	await app.listen({ port });
	console.log(
		`chat server on http://localhost:${port}${chaos ? "" : " (CHAOS=off)"}`,
	);
	return app;
};
