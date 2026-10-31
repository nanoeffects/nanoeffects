import { describe, expect, it } from "vitest";
import { createAction } from "../actions";
import { createBus } from "../core/bus";
import { events } from "../observable";
import { noPayload } from "./test-helpers";

type Events = { query: string; ping: undefined };

const readAll = async <T>(stream: AsyncIterableIterator<T>, count: number) => {
	const values: T[] = [];
	for await (const value of stream) {
		values.push(value);
		if (values.length === count) {
			break;
		}
	}

	return values;
};

describe("events", () => {
	it("reads the payloads in order", async () => {
		const bus = createBus<Events>();
		const stream = events(bus, "query");
		bus.emit("query", "a");
		bus.emit("query", "b");

		expect(await readAll(stream, 2)).toEqual(["a", "b"]);
	});

	it("listens from the call, not from the first read", async () => {
		const bus = createBus<Events>();
		const stream = events(bus, "query");
		bus.emit("query", "a");

		expect(await stream.next()).toEqual({ done: false, value: "a" });
	});

	it("answers a waiting read when the event comes", async () => {
		const bus = createBus<Events>();
		const stream = events(bus, "query");
		const waiting = stream.next();
		bus.emit("query", "late");

		expect(await waiting).toEqual({ done: false, value: "late" });
	});

	it("takes an action creator and gives its payload", async () => {
		const bus = createBus();
		const queryChanged = createAction<string>("query/changed");
		const stream = events(bus, queryChanged);
		bus.emit(queryChanged("a"));
		const { value } = await stream.next();

		expect(value).toBe("a");
	});

	it("delivers a payload that is undefined", async () => {
		const bus = createBus<Events>();
		const stream = events(bus, "ping");
		bus.emit("ping", noPayload);

		expect(await stream.next()).toEqual({ done: false, value: void 0 });
	});

	it("unsubscribes on break and drops what it holds", async () => {
		const bus = createBus<Events>();
		const stream = events(bus, "query");
		bus.emit("query", "a");
		bus.emit("query", "b");
		const [first] = await readAll(stream, 1);
		bus.emit("query", "c");

		expect(first).toBe("a");
		expect(bus.get("query")).toHaveLength(0);
		expect(await stream.next()).toEqual({ done: true, value: void 0 });
	});

	it("can be returned twice", async () => {
		const bus = createBus<Events>();
		const stream = events(bus, "query");

		expect(await stream.return?.()).toEqual({ done: true, value: void 0 });
		expect(await stream.return?.()).toEqual({ done: true, value: void 0 });
		expect(bus.get("query")).toHaveLength(0);
	});

	describe("the signal", () => {
		it("rejects a waiting read with the reason and then is done", async () => {
			const bus = createBus<Events>();
			const controller = new AbortController();
			const stream = events(bus, "query", { signal: controller.signal });
			const waiting = stream.next();
			const reason = new Error("unmounted");
			controller.abort(reason);

			await expect(waiting).rejects.toBe(reason);
			expect(await stream.next()).toEqual({ done: true, value: void 0 });
			expect(bus.get("query")).toHaveLength(0);
		});

		it("rejects the next read when nobody waited, and drops the buffer", async () => {
			const bus = createBus<Events>();
			const controller = new AbortController();
			const stream = events(bus, "query", { signal: controller.signal });
			bus.emit("query", "a");
			const reason = new Error("stop");
			controller.abort(reason);

			await expect(stream.next()).rejects.toBe(reason);
			expect(await stream.next()).toEqual({ done: true, value: void 0 });
		});

		it("rejects the loop of a signal that is aborted already", async () => {
			const bus = createBus<Events>();
			const stream = events(bus, "query", { signal: AbortSignal.abort("no") });

			await expect(stream.next()).rejects.toBe("no");
			expect(bus.get("query")).toHaveLength(0);
		});

		it("ends with the task when the source is a context", async () => {
			const bus = createBus<Events & { go: undefined }>();
			const seen: Array<Promise<unknown>> = [];
			let stop: (() => void) | undefined;
			bus.on("go", (_payload, ctx) => {
				const stream = events(ctx, "query");
				seen.push(stream.next());
				stop = () => ctx.abort("task over");
			});
			bus.emit("go", noPayload);
			stop?.();

			await expect(seen[0]).rejects.toBe("task over");
			expect(bus.get("query")).toHaveLength(0);
		});
	});

	describe("the buffer", () => {
		it("keeps the newest by default", async () => {
			const bus = createBus<Events>();
			const stream = events(bus, "query", { buffer: 2 });
			for (const value of ["1", "2", "3"]) {
				bus.emit("query", value);
			}

			expect(await readAll(stream, 2)).toEqual(["2", "3"]);
		});

		it("keeps the oldest with drop-newest", async () => {
			const bus = createBus<Events>();
			const stream = events(bus, "query", {
				buffer: 2,
				overflow: "drop-newest",
			});
			for (const value of ["1", "2", "3"]) {
				bus.emit("query", value);
			}

			expect(await readAll(stream, 2)).toEqual(["1", "2"]);
		});

		it("holds everything without a limit", async () => {
			const bus = createBus<Events>();
			const stream = events(bus, "query");
			for (let index = 0; index < 3000; index++) {
				bus.emit("query", String(index));
			}
			const values = await readAll(stream, 3000);

			expect(values).toHaveLength(3000);
			expect(values[0]).toBe("0");
			expect(values[2999]).toBe("2999");
		});

		it("holds nothing with a buffer of zero", async () => {
			const bus = createBus<Events>();
			const stream = events(bus, "query", { buffer: 0 });
			bus.emit("query", "lost");
			const waiting = stream.next();
			bus.emit("query", "seen");

			expect(await waiting).toEqual({ done: false, value: "seen" });
		});
	});
});
