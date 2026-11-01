import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { latest } from "../policies";
import { tracePlugin } from "./plugin";
import { type ReduxExtension, reduxDevtools } from "./redux";
import { createTracer } from "./tracer";

type Events = { search: unknown };

// what the extension does with a call: it keeps the JSON text of the action and the state, as
// its page script posts them to the extension; a failure here is what a payload it cannot serialize does
const serializingExtension = () => {
	const received: { action: string; state: string }[] = [];
	const connect = vi.fn((_options?: { name?: string; maxAge?: number }) => ({
		init: vi.fn((state: unknown) => {
			JSON.stringify(state);
		}),
		send: vi.fn((action: unknown, state: unknown) => {
			received.push({
				action: JSON.stringify(action),
				state: JSON.stringify(state),
			});
		}),
	}));
	const extension: ReduxExtension = { connect };

	return { extension, received, connect };
};

const setup = (options: Parameters<typeof reduxDevtools>[0] = {}) => {
	const fake = serializingExtension();
	const bus = createBus<Events>({
		trace: createTracer(
			reduxDevtools({ extension: fake.extension, ...options }),
		),
	}).use(tracePlugin());
	const seen: unknown[] = [];
	bus.on(
		"search",
		latest(async (payload) => {
			seen.push(payload);
		}),
	);

	return { ...fake, bus, seen };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reduxDevtools against the contract of the extension", () => {
	it("by default a successful call sends its payload once, not once for each stage", async () => {
		const payload = Array.from({ length: 1000 }, (_, index) => index);
		const { bus, received } = setup({ policies: true, starts: true });
		bus.emit("search", payload);
		await settle();
		const size = JSON.stringify(payload).length;
		const withPayload = received.filter((call) => call.action.length > size);

		expect(received).toHaveLength(3);
		expect(withPayload).toHaveLength(1);
		expect(JSON.parse(withPayload[0]?.action ?? "null").effect).toBe("emit");
	});

	it("payload none serializes a circular payload and a BigInt in every action", async () => {
		const cyclic: Record<string, unknown> = { name: "loop" };
		cyclic.self = cyclic;
		const failures = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { bus, received } = setup({
				policies: true,
				starts: true,
				payload: "none",
			});
			bus.emit("search", cyclic);
			bus.emit("search", 10n);
			await settle();

			expect(received).toHaveLength(6);
			expect(failures).not.toHaveBeenCalled();
		} finally {
			failures.mockRestore();
		}
	});

	it("connects once with the name, and every action and state is plain JSON", async () => {
		const { bus, received, connect } = setup({
			name: "app",
			policies: true,
			starts: true,
			depth: Number.POSITIVE_INFINITY,
		});
		bus.emit("search", { query: "nano", tags: ["a", "b"] });
		await settle();
		const actions = received.map((call) => JSON.parse(call.action));

		expect(connect).toHaveBeenCalledTimes(1);
		expect(connect).toHaveBeenCalledWith({ name: "app" });
		expect(actions.map((action) => action.type)).toEqual([
			"search",
			"search/latest/start",
			"search/latest/done",
		]);
		for (const call of received) {
			expect(JSON.parse(call.state)).toEqual({
				running: expect.any(Object),
			});
		}
		expect(actions[0]).toMatchObject({
			effect: "emit",
			phase: "done",
			payload: { query: "nano", tags: ["a", "b"] },
		});
	});

	it("keeps the state free of payloads: only the type, the effect and the group", async () => {
		const { bus, received } = setup({ policies: true, starts: true });
		bus.emit("search", { big: "x".repeat(1000) });
		await settle();
		const states = received.map((call) => call.state);

		expect(states.every((state) => !state.includes("xxxx"))).toBe(true);
	});

	it("makes a circular payload plain before the extension gets it, and serialize: false sends it as it is", async () => {
		const cyclic: Record<string, unknown> = { name: "loop" };
		cyclic.self = cyclic;
		const run = (serialize?: false) => {
			const sent: unknown[] = [];
			const extension: ReduxExtension = {
				connect: () => ({
					init: () => {},
					send: (action) => sent.push(action),
				}),
			};
			const bus = createBus<Events>({
				trace: createTracer(
					reduxDevtools({
						extension,
						...(serialize === false && { serialize }),
					}),
				),
			}).use(tracePlugin());
			bus.emit("search", cyclic);

			return sent;
		};

		const plain = run();
		const raw = run(false);

		expect(plain).toHaveLength(1);
		expect((plain[0] as { payload: unknown }).payload).toEqual({
			name: "loop",
			self: "[Circular]",
		});
		expect(() => JSON.stringify(plain)).not.toThrow();
		expect((raw[0] as { payload: unknown }).payload).toBe(cyclic);
	});

	it("a payload that is hard to serialize never breaks the handler or the emit, and is shown", async () => {
		const cyclic: Record<string, unknown> = { name: "loop" };
		cyclic.self = cyclic;
		const failures = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { bus, seen, received } = setup({ policies: true });

			expect(() => bus.emit("search", cyclic)).not.toThrow();
			await settle();

			expect(seen).toEqual([cyclic]);
			expect(failures).not.toHaveBeenCalled();
			expect(received.length).toBeGreaterThan(0);
		} finally {
			failures.mockRestore();
		}
	});

	it("a BigInt payload is shown as text, not thrown and not reported as a failure", async () => {
		const failures = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { bus, seen, received } = setup();

			expect(() => bus.emit("search", 10n)).not.toThrow();
			await settle();

			expect(seen).toEqual([10n]);
			expect(failures).not.toHaveBeenCalled();
			expect(JSON.parse(received[0]?.action ?? "{}").payload).toBe("10n");
		} finally {
			failures.mockRestore();
		}
	});

	it("payload all repeats the payload in every action, which is what makes a large one costly", async () => {
		const payload = Array.from({ length: 1000 }, (_, index) => index);
		const { bus, received } = setup({
			policies: true,
			starts: true,
			payload: "all",
		});
		bus.emit("search", payload);
		await settle();
		const size = JSON.stringify(payload).length;

		// the emit and the stages each carry a copy
		expect(received).toHaveLength(3);
		for (const call of received) {
			expect(call.action.length).toBeGreaterThan(size);
		}
	});
});
