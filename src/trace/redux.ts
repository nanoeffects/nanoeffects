import type { EffectName, Phase, TraceEvent, TraceLogger } from "../core/types";

type ReduxConnection = {
	init: (state: unknown) => void;
	send: (action: unknown, state: unknown) => void;
};

export type ReduxExtension = {
	connect: (options?: { name?: string; maxAge?: number }) => ReduxConnection;
};

/** A stage of a handler task: which policy (or `run`) and which phase of it. */
export type PolicyStage = { effect: EffectName; phase: Phase };

/**
 * Which stages of the handler tasks to show: `true` for all, a list of phases
 * (`["cancel", "drop"]`), or a function of the stage.
 */
export type PolicyStages =
	| boolean
	| readonly Phase[]
	| ((stage: PolicyStage) => boolean);

export type ReduxDevtoolsOptions = {
	/** Instance name in the Redux DevTools picker. */
	name?: string;
	/** Defaults to `globalThis.__REDUX_DEVTOOLS_EXTENSION__`. */
	extension?: ReduxExtension;
	/**
	 * Also show the stages of the handler tasks, the tasks that a policy
	 * (`latest`, `debounce`, ...) or `ctx.run` starts: `true` for every phase, a
	 * list of phases, or a function of `{ effect, phase }`. Default: none, the
	 * log has the emits only. The error of a handler task is always shown.
	 */
	policies?: PolicyStages;
	/**
	 * Also send the start of every shown task as an action. Default `false`: a
	 * task is one action, sent when it ends, and the tasks that are running are
	 * in the state.
	 */
	starts?: boolean;
	/**
	 * How deep below the handler tasks to show: `0` is none, `1` also the
	 * effects they start (`retry`, `timeout`, ...), and so on. Default `0`.
	 * The handler tasks themselves are chosen by `policies`.
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

const never = () => false;
const always = () => true;

// one predicate for the three forms of `policies`
const stagesOf = (policies: PolicyStages | undefined) => {
	if (typeof policies === "function") {
		return policies;
	}
	if (Array.isArray(policies)) {
		const phases = new Set<Phase>(policies);

		return ({ phase }: PolicyStage) => phases.has(phase);
	}

	return policies ? always : never;
};

/**
 * Trace logger that sends the trace to Redux DevTools. By default it is quiet:
 * one action for each emit (`type` is the event name, it needs `tracePlugin`),
 * and the failures of handlers. `policies` adds the stages of the handler tasks
 * as actions `event/policy/phase`, and `depth` the effects below them; the
 * running tasks are in the state. Read-only: there is no time travel. Does
 * nothing when the extension is not installed.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>({
 *   trace: createTracer(reduxDevtools({ name: "app" })),
 * }).use(tracePlugin());
 *
 * // and the cancelled and dropped calls of the policies
 * reduxDevtools({ name: "app", policies: ["cancel", "drop"] });
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

	const { starts = false, depth: shownDepth = 0, maxAge } = options;
	const showsStage = stagesOf(options.policies);
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

	// the handler tasks (level 0) are shown by `policies`, the tasks below them by `depth`
	const showsPhase = (effect: EffectName, phase: Phase, depth: number) => {
		if (depth === 0) {
			return showsStage({ effect, phase });
		}

		return depth <= shownDepth;
	};

	const track = (event: TraceEvent, depth: number) => {
		if (event.phase !== "start") {
			depths.delete(event.id);
			running.delete(event.id);
			return;
		}
		depths.set(event.id, depth);
		if (showsPhase(event.effect, "start", depth)) {
			running.set(event.id, {
				type: event.type,
				effect: event.effect,
				...(event.traceGroupId !== void 0 && {
					traceGroupId: event.traceGroupId,
				}),
			});
		}
	};

	// a finished handler task with no emit before it means `tracePlugin` is not used (or sample / filter cut the emits)
	let sawEmit = false;
	let warned = false;
	const checkEmits = (phase: Phase, depth: number) => {
		if (sawEmit || warned || depth !== 0 || phase === "start") {
			return;
		}
		warned = true;
		globalThis.console?.warn(
			"[nanoeffects] reduxDevtools got a task but no emit event: add bus.use(tracePlugin()) to see the emits.",
		);
	};

	const sendStage = (event: TraceEvent, error: unknown) => {
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

	return ({ error, ...event }) => {
		if (event.effect === "emit") {
			sawEmit = true;
			connection.send({ ...event, event: event.type }, snapshot());
			return;
		}

		const parentDepth =
			event.parentId === void 0 ? -1 : (depths.get(event.parentId) ?? -1);
		const depth = parentDepth + 1;
		track(event, depth);
		checkEmits(event.phase, depth);

		// a failed handler is never hidden; the attempts of an effect follow `depth`
		const failed = event.phase === "error" && depth === 0;
		const shown = failed || showsPhase(event.effect, event.phase, depth);
		if (shown && (event.phase !== "start" || starts)) {
			sendStage(event, error);
		}
	};
};
