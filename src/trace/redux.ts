import type { TraceLogger } from "../core/types";

type ReduxConnection = {
	init: (state: unknown) => void;
	send: (action: unknown, state: unknown) => void;
};

export type ReduxExtension = {
	connect: (options?: { name?: string; maxAge?: number }) => ReduxConnection;
};

export type ReduxDevtoolsOptions = {
	/** Instance name in the Redux DevTools picker. */
	name?: string;
	/** Defaults to `globalThis.__REDUX_DEVTOOLS_EXTENSION__`. */
	extension?: ReduxExtension;
	/**
	 * Also send the start of every task as an action. Default `false`: a task
	 * is one action, sent when it ends, and the tasks that are running are in
	 * the state.
	 */
	starts?: boolean;
	/**
	 * How deep in the tree of tasks to show: `0` is the handler tasks only, `1`
	 * also the effects they start (`retry`, `timeout`, ...), and so on. The
	 * attempts and the starters under them are hidden at the default, `1`.
	 */
	depth?: number;
	/** The number of actions that DevTools keeps; its own default is 50. */
	maxAge?: number;
};

export type ReduxDevtoolsState = {
	/** Tasks that started and have not settled yet, by trace id. */
	running: Record<
		number,
		{ type: string; effect: string; traceGroupId?: string }
	>;
};

const noop = () => {};

/**
 * Trace logger that sends the tasks to Redux DevTools as actions
 * `type/effect/phase`, with the running tasks as state. By default it is quiet:
 * a task is one action, when it ends, and only the handler tasks and the
 * effects they start are shown (see `starts` and `depth` to show more).
 * Read-only: there is no time travel. Does nothing when the extension is not
 * installed.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({
 *   trace: createTracer(reduxDevtools({ name: "app" })),
 * });
 * ```
 */
export const reduxDevtools = (
	options: ReduxDevtoolsOptions = {},
): TraceLogger => {
	const extension =
		options.extension ??
		(globalThis as { __REDUX_DEVTOOLS_EXTENSION__?: ReduxExtension })
			.__REDUX_DEVTOOLS_EXTENSION__;

	if (!extension) {
		return noop;
	}

	const { starts = false, depth: shownDepth = 1, maxAge } = options;
	const connection = extension.connect({
		name: options.name ?? "nanoeffects",
		...(maxAge !== void 0 && { maxAge }),
	});
	const running = new Map<
		number,
		{ type: string; effect: string; traceGroupId?: string }
	>();
	// how deep each task that has not ended is: its parent is one level up
	const depths = new Map<number, number>();
	const snapshot = (): ReduxDevtoolsState => ({
		running: Object.fromEntries(running),
	});

	connection.init(snapshot());

	return ({ error, ...event }) => {
		const parentDepth =
			event.parentId === void 0 ? -1 : (depths.get(event.parentId) ?? -1);
		const depth = parentDepth + 1;
		const shown = depth <= shownDepth;

		if (event.phase === "start") {
			depths.set(event.id, depth);
			if (shown) {
				running.set(event.id, {
					type: event.type,
					effect: event.effect,
					...(event.traceGroupId !== void 0 && {
						traceGroupId: event.traceGroupId,
					}),
				});
			}
		} else {
			depths.delete(event.id);
			running.delete(event.id);
		}
		if (!shown || (event.phase === "start" && !starts)) {
			return;
		}

		connection.send(
			{
				...event,
				type: `${event.type}/${event.effect}/${event.phase}`,
				event: event.type,
				...(event.phase === "error" && {
					error: error instanceof Error ? error.message : error,
				}),
			},
			snapshot(),
		);
	};
};
