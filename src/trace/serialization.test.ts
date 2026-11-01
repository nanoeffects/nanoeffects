import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { graphLogger } from "../graph";
import { latest } from "../policies";
import { consoleLogger } from "./console";
import { performanceLogger } from "./performance";
import { tracePlugin } from "./plugin";
import { createTraceRecorder } from "./recorder";
import { reduxDevtools } from "./redux";
import { createTracer } from "./tracer";

// What every built-in logger does with values that are not plain data. Whatever leaves the process (Redux
// DevTools, the Performance panel, a JSON file) must be plain, and no logger may throw on any value.

class User {
	name = "Ann";
}

const circular = () => {
	const value: { self?: unknown; list: unknown[] } = { list: [] };
	value.self = value;
	value.list.push(value);

	return value;
};

const trap = () => {
	throw new Error("trap");
};

const hostile: Record<string, () => unknown> = {
	circular,
	"circular in a Map": () => new Map([["k", circular()]]),
	"class instance": () => new User(),
	"throwing getter": () => ({
		ok: 1,
		get bad() {
			return trap();
		},
	}),
	"Error with a cause": () => new Error("boom", { cause: circular() }),
	"Error with a circular field": () =>
		Object.assign(new Error("boom"), { extra: circular() }),
	bigint: () => 10n,
	symbol: () => Symbol("s"),
	function: () => () => {},
	"Proxy whose traps throw": () =>
		new Proxy(
			{},
			{ get: trap, ownKeys: trap, getOwnPropertyDescriptor: trap, has: trap },
		),
	"null prototype": () => Object.assign(Object.create(null), { a: 1 }),
	"throwing toString": () => ({ toString: trap }),
	"DOM-like node": () => ({ nodeType: 1, nodeName: "DIV", parent: circular() }),
	"huge array": () => new Array(100_000).fill(1),
	"deep chain": () => {
		let value: unknown = 1;
		for (let index = 0; index < 5000; index += 1) {
			value = { next: value };
		}

		return value;
	},
	NaN: () => Number.NaN,
	undefined: () => void 0,
};

type Events = Record<string, unknown>;

const run = async (
	logger: Parameters<typeof createTracer>[0],
	payload: unknown,
	failure: unknown,
) => {
	const bus = createBus<Events>({
		trace: createTracer(logger),
		onError: () => {},
	});
	bus.use(tracePlugin());
	// a policy reports the start, the end and the failure of its handler, which a plain handler does not
	bus.on(
		"hostile",
		latest(async () => {
			throw failure;
		}),
	);
	bus.on(
		"hostile/ok",
		latest(async () => {}),
	);
	bus.emit("hostile", payload);
	bus.emit("hostile/ok", payload);
	await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("built-in loggers and values that are not plain data", () => {
	for (const [name, make] of Object.entries(hostile)) {
		describe(name, () => {
			it("reduxDevtools sends only plain data to the extension", async () => {
				const sent: unknown[] = [];
				const extension = {
					connect: () => ({
						init: () => {},
						send: (action: unknown, state: unknown) => {
							sent.push(action, state);
						},
					}),
				};
				const logger = reduxDevtools({
					extension,
					payload: "all",
					policies: true,
					depth: 2,
				});

				await run(logger, make(), make());
				expect(sent.length).toBeGreaterThan(0);
				// JSON.stringify throws on a circular value, a bigint and a getter that throws
				expect(() => JSON.stringify(sent)).not.toThrow();
			});

			it("performanceLogger records only plain details", async () => {
				const entries: unknown[] = [];
				const performance = {
					now: () => 0,
					mark: (_name: string, options?: { detail?: unknown }) =>
						entries.push(options?.detail),
					measure: (_name: string, options: { detail?: unknown }) =>
						entries.push(options.detail),
				};

				expect(() =>
					run(performanceLogger({ performance }), make(), make()),
				).not.toThrow();
				expect(() => JSON.stringify(entries)).not.toThrow();
			});

			it("consoleLogger does not throw", async () => {
				const console = { debug: vi.fn(), error: vi.fn() };

				expect(() =>
					run(consoleLogger({ console }), make(), make()),
				).not.toThrow();
			});

			it("the recorder keeps the value and gives plain data from toJSON", async () => {
				const recorder = createTraceRecorder();

				await run(recorder, make(), make());
				expect(recorder.events.length).toBeGreaterThan(0);
				expect(() => JSON.stringify(recorder)).not.toThrow();
				expect(() => JSON.stringify(recorder.toJSON())).not.toThrow();
			});

			it("the recorder with a capacity gives plain data too", async () => {
				const recorder = createTraceRecorder({ capacity: 5 });

				await run(recorder, make(), make());

				expect(() => JSON.stringify(recorder)).not.toThrow();
				expect(recorder.toJSON().length).toBeLessThanOrEqual(5);
			});

			it("graphLogger exports plain data, also with payloads", async () => {
				const graph = graphLogger({
					onCycle: () => {},
					console: { warn: vi.fn() },
				});

				await run(graph, make(), make());
				expect(() =>
					JSON.stringify(graph.toJSON({ payload: true })),
				).not.toThrow();
				expect(() => graph.toMermaid()).not.toThrow();
				expect(() => graph.toDot()).not.toThrow();
			});
		});
	}

	it("a logger given every kind of value at once survives them in one run", async () => {
		const recorder = createTraceRecorder();
		const sent: unknown[] = [];
		const logger = reduxDevtools({
			extension: {
				connect: () => ({
					init: () => {},
					send: (action) => sent.push(action),
				}),
			},
			payload: "all",
			policies: true,
		});
		const bus = createBus<Events>({
			trace: createTracer([
				recorder,
				logger,
				graphLogger({ onCycle: () => {} }),
			]),
			// the handler throws a hostile value on purpose, and nothing else may see it as unhandled
			onError: () => {},
		});
		bus.use(tracePlugin());
		bus.on(
			"each",
			latest(async () => {
				throw hostile.circular?.();
			}),
		);

		for (const make of Object.values(hostile)) {
			bus.emit("each", make());
		}
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(() => JSON.stringify(sent)).not.toThrow();
		expect(() => JSON.stringify(recorder)).not.toThrow();
	});
});

describe("reduxDevtools serialize option", () => {
	const extensionWith = (sent: unknown[]) => ({
		connect: () => ({
			init: () => {},
			send: (action: unknown) => sent.push(action),
		}),
	});

	it("uses your function for the payload and the error", () => {
		const sent: Array<{ payload?: unknown }> = [];
		const logger = reduxDevtools({
			extension: extensionWith(sent),
			payload: "all",
			serialize: () => "hidden",
		});
		const bus = createBus<Events>({
			trace: createTracer(logger),
			onError: () => {},
		});
		bus.use(tracePlugin());
		bus.emit("secret", { password: "hunter2" });

		expect(JSON.stringify(sent)).not.toContain("hunter2");
		expect(sent.some((action) => action.payload === "hidden")).toBe(true);
	});

	it("false sends the value as it is", () => {
		const sent: Array<{ payload?: unknown }> = [];
		const logger = reduxDevtools({
			extension: extensionWith(sent),
			payload: "all",
			serialize: false,
		});
		const bus = createBus<Events>({
			trace: createTracer(logger),
			onError: () => {},
		});
		bus.use(tracePlugin());
		const value = { a: 1 };
		bus.emit("raw", value);

		expect(sent.some((action) => action.payload === value)).toBe(true);
	});

	it("keeps the message of an Error, as before", async () => {
		const sent: Array<{ error?: unknown }> = [];
		const logger = reduxDevtools({
			extension: extensionWith(sent),
			policies: true,
		});
		const bus = createBus<Events>({
			trace: createTracer(logger),
			onError: () => {},
		});
		bus.use(tracePlugin());
		bus.on(
			"fail",
			latest(async () => {
				throw new Error("boom");
			}),
		);
		bus.emit("fail", 1);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(sent.some((action) => action.error === "boom")).toBe(true);
	});
});
