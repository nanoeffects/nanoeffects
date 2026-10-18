import type { TraceEvent } from "./types";

type DevtoolsConnection = {
	init: (state: unknown) => void;
	send: (action: unknown, state: unknown) => void;
};

export type DevtoolsExtension = {
	connect: (options?: { name?: string }) => DevtoolsConnection;
};

export type DevtoolsOptions = {
	/** Instance name in the Redux DevTools picker. */
	name?: string;
	/** Defaults to `globalThis.__REDUX_DEVTOOLS_EXTENSION__`. */
	extension?: DevtoolsExtension;
};

export type DevtoolsState = {
	/** Tasks that started and have not settled yet, by trace id. */
	running: Record<number, { type: string; effect: string }>;
};

const noop = () => {};

/**
 * `trace` hook that logs every task phase to Redux DevTools as an action
 * `type/effect/phase`, with the running tasks as state. Read-only: there is
 * no time travel. Does nothing when the extension is not installed.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({
 *   trace: connectDevtools({ name: "app" }),
 * });
 * ```
 */
export const connectDevtools = (
	options: DevtoolsOptions = {},
): ((event: TraceEvent) => void) => {
	const extension =
		options.extension ??
		(globalThis as { __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension })
			.__REDUX_DEVTOOLS_EXTENSION__;

	if (!extension) {
		return noop;
	}

	const connection = extension.connect({ name: options.name ?? "nanoeffects" });
	const running = new Map<number, { type: string; effect: string }>();
	const snapshot = (): DevtoolsState => ({
		running: Object.fromEntries(running),
	});

	connection.init(snapshot());

	return ({ error, ...event }) => {
		if (event.phase === "start") {
			running.set(event.id, { type: event.type, effect: event.effect });
		} else {
			running.delete(event.id);
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
