import { afterEach, describe, expect, it, vi } from "vitest";
import { contextPlugin } from "../context";
import { createBus } from "../core/bus";
import { latest } from "../policies";
import { signalFetch } from "./fetch";
import { fromSignal } from "./from-signal";

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

afterEach(() => {
	vi.restoreAllMocks();
});

describe("signalFetch", () => {
	it("sends the signal with the request, and the request stops with it", async () => {
		serve();
		const controller = new AbortController();
		const request = signalFetch(controller.signal)("/api");
		const outcome = request.then(
			() => "answered",
			(reason: unknown) => reason,
		);

		controller.abort(new Error("cancelled"));

		expect(await outcome).toEqual(new Error("cancelled"));
	});

	it("passes the other options unchanged", () => {
		const calls = serve();
		const controller = new AbortController();
		void signalFetch(controller.signal)("/api", {
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

	it("stops when the signal of the call aborts, and when the bound one does", async () => {
		serve();
		const bound = new AbortController();
		const own = new AbortController();
		const first = signalFetch(bound.signal)("/a", { signal: own.signal }).catch(
			(reason: unknown) => reason,
		);
		const second = signalFetch(bound.signal)("/b", {
			signal: own.signal,
		}).catch((reason: unknown) => reason);

		own.abort("own");
		expect(await first).toBe("own");
		bound.abort("bound");
		expect(await second).toBe("own");
	});

	it("stops with the bound signal when the call has none of its own", async () => {
		serve();
		const bound = new AbortController();
		const request = signalFetch(bound.signal)("/a").catch(
			(reason: unknown) => reason,
		);

		bound.abort("bound");

		expect(await request).toBe("bound");
	});

	it("gives every task a ctx.fetch that stops when the policy cancels the handler", async () => {
		const calls = serve();
		const bus = createBus<{ search: string }>({ onError: () => {} }).use(
			contextPlugin({ fetch: fromSignal(signalFetch) }),
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
});
