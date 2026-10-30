import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfile } from "../../examples/api-server/src/profile";
import { buildServer } from "../../examples/api-server/src/server";
import {
	HttpError,
	type Pokemon,
	type Upstream,
} from "../../examples/api-server/src/upstream";
import {
	createMailer,
	type Email,
	type Mailer,
} from "../../examples/job-worker/src/mailer";
import { buildServer as buildWorkerServer } from "../../examples/job-worker/src/server";
import { createWorker } from "../../examples/job-worker/src/worker";
import { createFeed, type Feed } from "../../examples/ws-server/src/feed";
import { buildServer as buildPricesServer } from "../../examples/ws-server/src/server";
import { createBus } from "../core/bus";
import { signalPlugin } from "../signal";

// The two backend examples run against fakes: no network, no browser.

const noLog = () => {};

describe("api-server", () => {
	const running: Array<{ shutdown: () => Promise<void> }> = [];

	afterEach(async () => {
		for (const server of running.splice(0)) {
			await server.shutdown();
		}
	});

	const pikachu: Pokemon = {
		name: "pikachu",
		types: ["electric"],
		abilities: ["static", "lightning-rod"],
	};

	const fakeUpstream = (overrides: Partial<Upstream> = {}): Upstream => ({
		getPokemon: async () => pikachu,
		getAbilityText: async (name) => `text of ${name}`,
		...overrides,
	});

	// the app with a fake upstream; `inject` needs no port
	const start = (upstream: Upstream) => {
		const built = buildServer({ upstream, log: noLog });
		running.push(built);

		return built;
	};

	// the same app, listening on a free port, for the tests that need a real connection
	const listen = async (upstream: Upstream) => {
		const built = start(upstream);
		await built.app.listen({ port: 0 });
		const { port } = built.app.server.address() as AddressInfo;

		return { ...built, url: `http://localhost:${port}` };
	};

	// resolves when the signal aborts, rejects like a fetch does
	const untilAborted = (signal: AbortSignal) =>
		new Promise<never>((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(signal.reason));
		});

	describe("answers", () => {
		it("gives the name, the types and every ability with its text", async () => {
			const { app } = start(fakeUpstream());
			const response = await app.inject({ url: "/pokemon/pikachu" });

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				name: "pikachu",
				types: ["electric"],
				abilities: [
					{ name: "static", text: "text of static" },
					{ name: "lightning-rod", text: "text of lightning-rod" },
				],
			});
		});

		it("answers 200 with text null for an ability that failed", async () => {
			const upstream = fakeUpstream({
				getAbilityText: async (name) => {
					if (name === "static") {
						throw new HttpError(500, "broken");
					}
					return `text of ${name}`;
				},
			});
			const { app } = start(upstream);
			const response = await app.inject({ url: "/pokemon/pikachu" });

			expect(response.statusCode).toBe(200);
			expect(response.json().abilities).toEqual([
				{ name: "static", text: null },
				{ name: "lightning-rod", text: "text of lightning-rod" },
			]);
		});

		it("answers 404 for an unknown route", async () => {
			const { app } = start(fakeUpstream());
			const response = await app.inject({ url: "/nothing" });

			expect(response.statusCode).toBe(404);
		});
	});

	describe("statuses", () => {
		it("answers 404 for an unknown name and asks once", async () => {
			const getPokemon = vi.fn(async () => {
				throw new HttpError(404, "Not Found");
			});
			const { app } = start(fakeUpstream({ getPokemon }));
			const response = await app.inject({ url: "/pokemon/missingno" });

			expect(response.statusCode).toBe(404);
			expect(getPokemon).toHaveBeenCalledTimes(1);
			expect(response.json()).toEqual({ error: "Not Found" });
		});

		it("answers 504 for a timeout", async () => {
			const getPokemon = async () => {
				throw new DOMException("Timed out", "TimeoutError");
			};
			const { app } = start(fakeUpstream({ getPokemon }));
			const response = await app.inject({ url: "/pokemon/pikachu" });

			expect(response.statusCode).toBe(504);
		});

		it("answers 502 for any other failure", async () => {
			const getPokemon = async () => {
				throw new Error("connection lost");
			};
			const { app } = start(fakeUpstream({ getPokemon }));
			const response = await app.inject({ url: "/pokemon/pikachu" });

			expect(response.statusCode).toBe(502);
		});
	});

	describe("limits and retries", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		// the command on a bus of its own, so fake timers never touch a socket
		const profileOn = (upstream: Upstream) => {
			const bus = createBus().use(signalPlugin());
			const loadProfile = createProfile(upstream);

			return (name: string) => bus.emit(loadProfile(name));
		};

		it("tries again after a failure that is not an answer", async () => {
			let calls = 0;
			const getPokemon = vi.fn(async () => {
				calls += 1;
				if (calls < 3) {
					throw new HttpError(503, "busy");
				}
				return pikachu;
			});
			const load = profileOn(fakeUpstream({ getPokemon }));
			const profile = load("pikachu");
			await vi.advanceTimersByTimeAsync(600);

			await expect(profile).resolves.toMatchObject({ name: "pikachu" });
			expect(getPokemon).toHaveBeenCalledTimes(3);
		});

		it("gives text null for an ability that takes longer than 3 s", async () => {
			const getAbilityText = (
				name: string,
				{ signal }: { signal: AbortSignal },
			) => {
				if (name === "static") {
					return untilAborted(signal);
				}
				return Promise.resolve(`text of ${name}`);
			};
			const load = profileOn(fakeUpstream({ getAbilityText }));
			const profile = load("pikachu");
			await vi.advanceTimersByTimeAsync(3000);

			await expect(profile).resolves.toMatchObject({
				abilities: [
					{ name: "static", text: null },
					{ name: "lightning-rod", text: "text of lightning-rod" },
				],
			});
		});
	});

	describe("a client that leaves", () => {
		// a pokémon request that reports its signal and stays open until it is aborted
		const watching = () => {
			const seen: AbortSignal[] = [];
			let begin = () => {};
			const started = new Promise<void>((resolve) => {
				begin = resolve;
			});
			const getPokemon = (
				_name: string,
				{ signal }: { signal: AbortSignal },
			) => {
				seen.push(signal);
				begin();
				return untilAborted(signal);
			};

			return { seen, started, getPokemon };
		};

		it("aborts the signal of the upstream request", async () => {
			const { seen, started, getPokemon } = watching();
			const { url } = await listen(fakeUpstream({ getPokemon }));
			const client = new AbortController();
			const request = fetch(`${url}/pokemon/pikachu`, {
				signal: client.signal,
			}).catch(() => "left");
			await started;
			client.abort();
			await request;
			await vi.waitFor(() => expect(seen[0]?.aborted).toBe(true));

			expect(seen).toHaveLength(1);
		});

		it("asks for no ability when the pokémon request was cancelled", async () => {
			const getAbilityText = vi.fn(async () => "text");
			const { started, getPokemon } = watching();
			const { url } = await listen(
				fakeUpstream({ getPokemon, getAbilityText }),
			);
			const client = new AbortController();
			const request = fetch(`${url}/pokemon/pikachu`, {
				signal: client.signal,
			}).catch(() => "left");
			await started;
			client.abort();
			await request;
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(getAbilityText).not.toHaveBeenCalled();
		});
	});

	describe("health and shutdown", () => {
		// a pokémon request that stays open until `release` is called
		const hanging = () => {
			let release = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const getPokemon = async () => {
				await gate;
				return pikachu;
			};

			return { getPokemon, release };
		};

		it("tells how many requests are in flight", async () => {
			const { getPokemon, release } = hanging();
			const { app } = start(fakeUpstream({ getPokemon }));
			const first = app.inject({ url: "/pokemon/a" });
			const second = app.inject({ url: "/pokemon/b" });
			await vi.waitFor(async () => {
				const health = await app.inject({ url: "/health" });
				expect(health.json()).toEqual({ inFlight: 2 });
			});
			release();
			await Promise.all([first, second]);
			const health = await app.inject({ url: "/health" });

			expect(health.json()).toEqual({ inFlight: 0 });
		});

		it("aborts the requests in flight, answers them 503 and stops listening", async () => {
			const seen: AbortSignal[] = [];
			let begin = () => {};
			const started = new Promise<void>((resolve) => {
				begin = resolve;
			});
			const getPokemon = (
				_name: string,
				{ signal }: { signal: AbortSignal },
			) => {
				seen.push(signal);
				begin();
				return untilAborted(signal);
			};
			const { url, shutdown } = await listen(fakeUpstream({ getPokemon }));
			const request = fetch(`${url}/pokemon/pikachu`);
			await started;
			await shutdown();
			const response = await request;

			expect(seen[0]?.aborted).toBe(true);
			expect(response.status).toBe(503);
			await expect(fetch(`${url}/health`)).rejects.toThrow();
		});
	});
});

describe("job-worker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const email = (subject = "hello"): Email => ({ to: "a@b.c", subject });

	// wraps a mailer to count the sends and how many are in progress at once
	const watched = (mailer: Mailer) => {
		const seen = { sends: 0, active: 0, mostActive: 0 };
		const wrapper: Mailer = {
			async send(message, options) {
				seen.sends += 1;
				seen.active += 1;
				seen.mostActive = Math.max(seen.mostActive, seen.active);
				try {
					return await mailer.send(message, options);
				} finally {
					seen.active -= 1;
				}
			},
		};

		return { seen, mailer: wrapper };
	};

	const workerWith = (mailer: Mailer, drainMs = 5000) =>
		createWorker({ mailer, drainMs, log: noLog });

	const settle = async (ms: number) => {
		await vi.advanceTimersByTimeAsync(ms);
	};

	describe("sending", () => {
		it("answers before the email is sent", async () => {
			const { mailer } = watched(createMailer({ sendMs: 300 }));
			const worker = workerWith(mailer);
			const id = worker.accept(email());

			expect(id).toBe("1");
			expect(worker.counts().sent).toBe(0);
			await settle(300);

			expect(worker.counts().sent).toBe(1);
		});

		it("never sends more than three at once", async () => {
			const { mailer, seen } = watched(
				createMailer({ sendMs: 100, shouldFail: () => false }),
			);
			const worker = workerWith(mailer);
			for (let index = 0; index < 10; index += 1) {
				worker.accept(email());
			}
			await settle(0);

			expect(worker.counts()).toMatchObject({ queued: 7, running: 3 });
			await settle(1000);

			expect(seen.mostActive).toBe(3);
			expect(worker.counts().sent).toBe(10);
		});

		it("tries a 503 again and the email is sent", async () => {
			const { mailer, seen } = watched(
				createMailer({ sendMs: 10, shouldFail: (attempt) => attempt === 1 }),
			);
			const worker = workerWith(mailer);
			worker.accept(email());
			await settle(1000);

			expect(seen.sends).toBe(2);
			expect(worker.counts()).toMatchObject({ sent: 1, failed: 0 });
		});

		it("gives up on a mailer that does not answer, without a retry", async () => {
			const { mailer, seen } = watched(createMailer());
			const worker = workerWith(mailer);
			worker.accept(email("/hang forever"));
			await settle(1000);

			expect(seen.sends).toBe(1);
			expect(worker.counts()).toMatchObject({ failed: 1, running: 0 });
		});

		it("does not try a refused address again", async () => {
			const { mailer, seen } = watched(createMailer());
			const worker = workerWith(mailer);
			worker.accept(email("/bad address"));
			await settle(0);

			expect(seen.sends).toBe(1);
			expect(worker.counts()).toMatchObject({ failed: 1 });
		});

		it("adds the counts up to the emails accepted", async () => {
			const { mailer } = watched(createMailer({ sendMs: 50 }));
			const worker = workerWith(mailer);
			for (let index = 0; index < 8; index += 1) {
				worker.accept(email());
			}
			worker.accept(email("/hang"));
			worker.accept(email("/bad"));
			await settle(10_000);
			const counts = worker.counts();

			expect(counts.queued + counts.running).toBe(0);
			expect(counts.sent + counts.failed + counts.cancelled).toBe(10);
			expect(counts.failed).toBe(2);
		});
	});

	describe("shutdown", () => {
		it("stops taking emails at once", async () => {
			const { mailer } = watched(createMailer({ sendMs: 100 }));
			const worker = workerWith(mailer);
			worker.accept(email());
			const done = worker.shutdown();

			expect(worker.isAccepting()).toBe(false);
			await settle(200);
			await done;
		});

		it("returns at once when the emails in flight finish in time", async () => {
			const { mailer } = watched(
				createMailer({ sendMs: 100, shouldFail: () => false }),
			);
			const worker = workerWith(mailer, 5000);
			for (let index = 0; index < 3; index += 1) {
				worker.accept(email());
			}
			let finished = false;
			const done = worker.shutdown().then((counts) => {
				finished = true;
				return counts;
			});
			await settle(100);

			expect(finished).toBe(true);
			expect(await done).toMatchObject({ sent: 3, cancelled: 0 });
		});

		it("cancels what is left when the deadline passes", async () => {
			const { mailer } = watched(createMailer({ sendMs: 10_000 }));
			const worker = workerWith(mailer, 500);
			for (let index = 0; index < 5; index += 1) {
				worker.accept(email());
			}
			await settle(0);
			const done = worker.shutdown();
			await settle(500);
			const counts = await done;

			expect(counts).toMatchObject({ sent: 0, running: 0, queued: 0 });
			expect(counts.cancelled).toBe(5);
		});

		it("returns at once when nothing is in flight", async () => {
			const { mailer } = watched(createMailer());
			const worker = workerWith(mailer);
			const counts = await worker.shutdown();

			expect(counts).toEqual({
				queued: 0,
				running: 0,
				sent: 0,
				failed: 0,
				cancelled: 0,
			});
		});
	});
});

describe("job-worker over http", () => {
	const started: Array<() => Promise<unknown>> = [];

	afterEach(async () => {
		for (const stop of started.splice(0)) {
			await stop();
		}
	});

	// a slow mailer, so an email is still queued or running when the test looks
	const start = () => {
		const mailer = createMailer({ sendMs: 5000 });
		const worker = createWorker({ mailer, drainMs: 20, log: noLog });
		const app = buildWorkerServer({ worker });
		started.push(() => worker.shutdown());
		started.push(() => app.close());

		return { worker, app };
	};

	it("answers 202 with an id before the send, and /stats shows the queue", async () => {
		const { app } = start();
		const response = await app.inject({
			method: "POST",
			url: "/emails",
			payload: { to: "a@b.c", subject: "hi" },
		});

		expect(response.statusCode).toBe(202);
		expect(response.json()).toEqual({ id: "1" });
		const stats = (await app.inject({ url: "/stats" })).json();

		expect(stats).toMatchObject({ sent: 0 });
		expect(stats.queued + stats.running).toBe(1);
	});

	it("answers 400 for a body that is not an email", async () => {
		const { app } = start();
		const response = await app.inject({
			method: "POST",
			url: "/emails",
			payload: { to: 1 },
		});

		expect(response.statusCode).toBe(400);
	});

	it("answers 503 and queues nothing during the shutdown", async () => {
		const { app, worker } = start();
		const shutdown = worker.shutdown();
		const response = await app.inject({
			method: "POST",
			url: "/emails",
			payload: { to: "a@b.c", subject: "late" },
		});
		await shutdown;

		expect(response.statusCode).toBe(503);
		expect(worker.counts().queued).toBe(0);
	});
});

describe("ws-server", () => {
	const running: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const shutdown of running.splice(0)) {
			await shutdown();
		}
	});

	// the real feed, but it counts how often it is asked
	const countingFeed = () => {
		const feed = createFeed();
		const asked = { count: 0 };
		const counting: Feed = {
			priceOf: (symbol, tick) => {
				asked.count += 1;
				return feed.priceOf(symbol, tick);
			},
		};

		return { feed: counting, asked, real: feed };
	};

	const start = async (options: { idleMs?: number } = {}) => {
		const { feed, asked, real } = countingFeed();
		const built = buildPricesServer({
			feed,
			tickMs: 10,
			idleMs: options.idleMs ?? 5000,
			log: noLog,
		});
		await built.app.ready();
		running.push(built.shutdown);

		return { ...built, asked, real };
	};

	// a client that keeps what the server sent
	const connect = async (app: Awaited<ReturnType<typeof start>>["app"]) => {
		const socket = await app.injectWS("/prices");
		const messages: Array<{ symbol?: string; price?: number; error?: string }> =
			[];
		socket.on("message", (data) => {
			messages.push(JSON.parse(String(data)));
		});
		const closed = new Promise<number>((resolve) => {
			socket.on("close", (code) => resolve(code));
		});

		return { socket, messages, closed };
	};

	const subscribe = (
		socket: { send: (text: string) => void },
		symbol: string,
	) => socket.send(JSON.stringify({ subscribe: symbol }));

	it("sends the prices of the symbol it was asked for", async () => {
		const { app, real } = await start();
		const { socket, messages } = await connect(app);
		subscribe(socket, "BTC");
		await vi.waitFor(() => expect(messages.length).toBeGreaterThanOrEqual(3));

		expect(messages[0]).toEqual({
			symbol: "BTC",
			price: real.priceOf("BTC", 1),
			time: 1,
		});
		expect(messages[1]?.price).toBe(real.priceOf("BTC", 2));
		socket.close();
	});

	it("answers a message it does not understand and keeps the socket open", async () => {
		const { app } = await start();
		const { socket, messages } = await connect(app);
		socket.send("hello");
		await vi.waitFor(() => expect(messages).toHaveLength(1));

		expect(messages[0]).toHaveProperty("error");
		expect(socket.readyState).toBe(socket.OPEN);
		socket.close();
	});

	it("stops the old symbol when the socket subscribes again", async () => {
		const { app } = await start();
		const { socket, messages } = await connect(app);
		subscribe(socket, "BTC");
		await vi.waitFor(() => expect(messages.length).toBeGreaterThan(0));
		subscribe(socket, "ETH");
		await vi.waitFor(() =>
			expect(messages.some((message) => message.symbol === "ETH")).toBe(true),
		);
		const after = messages.length;
		await new Promise((resolve) => setTimeout(resolve, 60));
		const later = messages.slice(after).map((message) => message.symbol);

		expect(later.length).toBeGreaterThan(0);
		expect(new Set(later)).toEqual(new Set(["ETH"]));
		socket.close();
	});

	it("keeps the other socket's symbol when one socket subscribes again", async () => {
		const { app } = await start();
		const first = await connect(app);
		const second = await connect(app);
		subscribe(first.socket, "BTC");
		subscribe(second.socket, "ETH");
		await vi.waitFor(() => expect(second.messages.length).toBeGreaterThan(1));
		subscribe(first.socket, "SOL");
		const before = second.messages.length;
		await vi.waitFor(() =>
			expect(second.messages.length).toBeGreaterThan(before + 2),
		);

		expect(new Set(second.messages.map((message) => message.symbol))).toEqual(
			new Set(["ETH"]),
		);
		first.socket.close();
		second.socket.close();
	});

	it("stops asking the feed when the socket closes", async () => {
		const { app, asked } = await start();
		const { socket, messages, closed } = await connect(app);
		subscribe(socket, "BTC");
		await vi.waitFor(() => expect(messages.length).toBeGreaterThan(1));
		// terminate — the client goes away without a closing handshake, as a closed tab does
		socket.terminate();
		await closed;
		await new Promise((resolve) => setTimeout(resolve, 20));
		const count = asked.count;
		await new Promise((resolve) => setTimeout(resolve, 60));

		expect(asked.count).toBe(count);
	});

	it("closes a socket that is silent with code 1001", async () => {
		const { app } = await start({ idleMs: 60 });
		const { closed } = await connect(app);

		expect(await closed).toBe(1001);
	});

	it("keeps a socket open while it sends messages", async () => {
		const { app } = await start({ idleMs: 100 });
		const { socket } = await connect(app);
		for (let round = 0; round < 5; round += 1) {
			socket.send("still here");
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		expect(socket.readyState).toBe(socket.OPEN);
		socket.close();
	});

	it("closes every socket with 1001 on shutdown", async () => {
		const { app, shutdown } = await start();
		const first = await connect(app);
		const second = await connect(app);
		subscribe(first.socket, "BTC");
		await vi.waitFor(() => expect(first.messages.length).toBeGreaterThan(0));
		await shutdown();

		expect(await first.closed).toBe(1001);
		expect(await second.closed).toBe(1001);
	});
});
