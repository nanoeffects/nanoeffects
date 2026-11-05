import { afterEach, describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { delay, effectsPlugin, race } from "../effects";
import { latest } from "../policies";
import { signalFetch } from "./fetch";

// a server that answers when it is told to, and stops when the signal of the request aborts
const serve = () => {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
		calls.push({ url: String(input), init });

		return new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () =>
				reject(init.signal?.reason),
			);
		});
	});

	return calls;
};

const settle = (request: Promise<Response>) =>
	request.then(
		() => "answered",
		(reason: unknown) => reason,
	);

afterEach(() => {
	vi.restoreAllMocks();
});

describe("signalFetch", () => {
	it("sends the signal of the task with the request, and the request stops with it", async () => {
		serve();
		const controller = new AbortController();
		const outcome = settle(signalFetch(controller, "/api"));

		controller.abort(new Error("cancelled"));

		expect(await outcome).toEqual(new Error("cancelled"));
	});

	it("stops for the signal of an outside source", async () => {
		serve();
		const outside = new AbortController();
		const outcome = settle(signalFetch({ signal: outside.signal }, "/api"));

		outside.abort("outside");

		expect(await outcome).toBe("outside");
	});

	it("passes the other options unchanged", () => {
		const calls = serve();
		const controller = new AbortController();
		void signalFetch(controller, "/api", {
			method: "POST",
			body: "x",
			headers: { a: "b" },
		}).catch(() => {});

		expect(calls[0]?.init).toMatchObject({
			method: "POST",
			body: "x",
			headers: { a: "b" },
		});
	});

	it("stops when the signal of the call aborts, and when the one of the task does", async () => {
		serve();
		const task = new AbortController();
		const own = new AbortController();
		const first = settle(signalFetch(task, "/a", { signal: own.signal }));
		const second = settle(signalFetch(task, "/b", { signal: own.signal }));

		own.abort("own");
		expect(await first).toBe("own");
		task.abort("task");
		expect(await second).toBe("own");
	});

	it("stops with the signal of the task when the call has none of its own", async () => {
		serve();
		const task = new AbortController();
		const outcome = settle(signalFetch(task, "/a"));

		task.abort("task");

		expect(await outcome).toBe("task");
	});

	it("works with a context that has no signal, as plain JavaScript may pass", async () => {
		const calls = serve();
		const own = new AbortController();
		// @ts-expect-error the types ask for a signal; plain JavaScript may pass {}
		const outcome = settle(signalFetch({}, "/a", { signal: own.signal }));
		// @ts-expect-error the types ask for a signal; plain JavaScript may pass {}
		void settle(signalFetch({}, "/b"));

		own.abort("own");

		expect(await outcome).toBe("own");
		expect(calls[1]?.init?.signal).toBeUndefined();
	});

	it("runs in a handler with nothing on the bus", async () => {
		const calls = serve();
		const bus = createBus<{ search: string }>({ onError: () => {} });
		const outcomes: unknown[] = [];
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				try {
					await signalFetch(ctx, `/api?q=${query}`);
				} catch (reason) {
					outcomes.push(reason instanceof Error ? reason.name : reason);
				}
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(calls.map((call) => call.url)).toEqual(["/api?q=a", "/api?q=ab"]);
		expect(outcomes).toHaveLength(1);
		expect(calls[0]?.init?.signal?.aborted).toBe(true);
		expect(calls[1]?.init?.signal?.aborted).toBe(false);
	});

	it("gives every task a ctx.fetch through effectsPlugin that stops when the policy cancels the handler", async () => {
		const calls = serve();
		const bus = createBus<{ search: string }>({ onError: () => {} }).use(
			effectsPlugin({ fetch: signalFetch }),
		);
		const outcomes: unknown[] = [];
		bus.on(
			"search",
			latest(async (query: string, ctx) => {
				try {
					await ctx.fetch(`/api?q=${query}`);
				} catch (reason) {
					outcomes.push(reason instanceof Error ? reason.name : reason);
				}
			}),
		);

		bus.emit("search", "a");
		bus.emit("search", "ab");
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(calls.map((call) => call.url)).toEqual(["/api?q=a", "/api?q=ab"]);
		expect(outcomes).toHaveLength(1);
		expect(calls[0]?.init?.signal?.aborted).toBe(true);
		expect(calls[1]?.init?.signal?.aborted).toBe(false);
	});

	it("ctx.fetch inside race is bound to the child, so the loser stops with the race", async () => {
		vi.useFakeTimers();
		const calls = serve();
		const bus = createBus<{ load: string }>({ onError: () => {} }).use(
			effectsPlugin({ fetch: signalFetch, race, delay }),
		);
		const outcomes: unknown[] = [];
		bus.on("load", async (url: string, ctx) => {
			const result = await ctx.race({
				data: ({ fetch }) => fetch(url),
				timeout: ({ delay: wait }) => wait(100),
			});
			outcomes.push(Object.keys(result));
		});

		bus.emit("load", "/slow");
		await vi.advanceTimersByTimeAsync(100);

		expect(outcomes).toEqual([["timeout"]]);
		expect(calls[0]?.init?.signal?.aborted).toBe(true);
		vi.useRealTimers();
	});
});
