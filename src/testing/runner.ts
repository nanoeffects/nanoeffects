import { type Bus, type BusOptions, createBus } from "../core/bus";
import type { EventMap, TraceLogger } from "../core/types";
import { tracePlugin } from "../trace/plugin";
import { createTracer } from "../trace/tracer";
import type { Clock } from "./clock";
import { diagramOf, framesOfDiagram, letterOf, phaseFramesOf } from "./marble";

export type MarbleOptions<E extends EventMap> = Omit<BusOptions<E>, "trace"> & {
	/** Moves time and tells it. `fakeTimersClock(vi)` is one. */
	clock: Clock;
	/** The length of a frame in milliseconds. Default 10. */
	frame?: number;
};

/** What to emit for one event: a diagram, and the value of each character (the character itself by default). */
export type EmitMarble = {
	marble: string;
	values?: Record<string, unknown>;
};

export type RunOptions = {
	/** Event name → what to emit. */
	emits?: Record<string, EmitMarble>;
	/** How many frames to run. Default: the length of the longest diagram of `emits`. */
	frames?: number;
};

export type MarbleResult = {
	/** The number of frames that were run. */
	frames: number;
	/** The phases of every traced task as diagrams, by `type:effect`. */
	rows(): Record<string, string>;
	/**
	 * Throws when a row differs, with both diagrams. A key with `:` is one row (`search:run`), a key
	 * without it is the effect (`latest`) and must match one row. Returns the result.
	 */
	expect(expected: Record<string, string>): MarbleResult;
};

type Seen = { key: string; letter: string; at: number };

const valueFor = (values: Record<string, unknown> | undefined, char: string) =>
	values && Object.hasOwn(values, char) ? values[char] : char;

const framesOfRow = (
	seen: readonly Seen[],
	key: string,
	start: number,
	frame: number,
	length: number,
) => {
	const frames: string[][] = Array.from({ length }, () => []);
	for (const item of seen) {
		const index = Math.floor((item.at - start) / frame);
		if (item.key === key && index >= 0 && index < length) {
			frames[index]?.push(item.letter);
		}
	}

	return frames;
};

// the row a key of `expect` names: the full `type:effect`, or an effect that only one row has
const rowOf = (keys: readonly string[], key: string) => {
	if (key.includes(":")) {
		return keys.includes(key) ? [key] : [];
	}

	return keys.filter((candidate) => candidate.endsWith(`:${key}`));
};

const message = (key: string, expected: string, received: string) =>
	`marble row "${key}" differs\n  expected  ${expected}\n  received  ${received}`;

const resultOf = (
	seen: readonly Seen[],
	start: number,
	frame: number,
	length: number,
): MarbleResult => {
	const keys = [...new Set(seen.map((item) => item.key))];
	const rows = () =>
		Object.fromEntries(
			keys.map((key) => [
				key,
				diagramOf(framesOfRow(seen, key, start, frame, length), length),
			]),
		);

	const result: MarbleResult = {
		frames: length,
		rows,
		expect: (expected) => {
			const received = rows();
			for (const [name, diagram] of Object.entries(expected)) {
				const matched = rowOf(keys, name);
				const [key] = matched;
				if (key === void 0) {
					throw new Error(
						`marble row "${name}" matches no task; rows: ${keys.join(", ") || "none"}`,
					);
				}
				if (matched.length > 1) {
					throw new Error(
						`marble row "${name}" matches more than one task (${matched.join(", ")}): give the full key`,
					);
				}
				const want = diagramOf(phaseFramesOf(diagram), length);
				if (want !== received[key]) {
					throw new Error(message(key, want, received[key] ?? ""));
				}
			}

			return result;
		},
	};

	return result;
};

/**
 * A bus that records its trace, and a `run` that moves time frame by frame, emits what the
 * diagrams say at the start of each frame, and gives the phases of the tasks back as diagrams.
 * Register the listeners on `bus`, then `run`. It needs a tracer, so there is no `notrace` build.
 *
 * @example
 * ```ts
 * const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });
 * marbles.bus.on("search/changed", latest(search), { traceId: "search" });
 *
 * const result = await marbles.run({
 *   emits: { "search/changed": { marble: "a-b---", values: { a: "x", b: "xy" } } },
 *   frames: 12,
 * });
 * result.expect({ latest: "s-c-d-" });
 * ```
 */
export const createMarbleBus = <E extends EventMap = EventMap>(
	options: MarbleOptions<E>,
) => {
	const { clock, frame = 10, ...busOptions } = options;
	const seen: Seen[] = [];
	const logger: TraceLogger = (event) => {
		if (event.effect !== "emit") {
			seen.push({
				key: `${event.type}:${event.effect}`,
				letter: letterOf(event.phase),
				at: clock.now(),
			});
		}
	};
	const bus: Bus<E> = createBus<E>({
		...busOptions,
		trace: createTracer(logger),
	});
	bus.use(tracePlugin());

	const run = async ({ emits = {}, frames }: RunOptions = {}) => {
		const schedule = Object.entries(emits).map(([event, spec]) => ({
			event,
			frames: framesOfDiagram(spec.marble),
			values: spec.values,
		}));
		const length =
			frames ?? Math.max(0, ...schedule.map((item) => item.frames.length));
		seen.length = 0;
		const start = clock.now();
		for (let index = 0; index < length; index += 1) {
			for (const item of schedule) {
				for (const char of item.frames[index] ?? []) {
					Reflect.apply(bus.emit, bus, [
						item.event,
						valueFor(item.values, char),
					]);
				}
			}
			await clock.advance(frame);
		}

		return resultOf(seen, start, frame, length);
	};

	return { bus, run };
};
