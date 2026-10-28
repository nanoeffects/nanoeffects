import { createTask } from "../core/context";
import type { EventMap, PayloadOf, Task } from "../core/types";

/** What `withPolicy` returns: the task as a plain function that can be cancelled. */
export type PolicyFunction<P, R> = {
	(...args: PayloadOf<P>): Promise<Awaited<R> | undefined>;
	/** Aborts every call that has not finished. Calls made after it work as before. */
	cancel: (reason?: unknown) => void;
	/** Same as `cancel`; present where `Symbol.dispose` exists, for `using`. */
	[Symbol.dispose]?: () => void;
};

// `Symbol.dispose` is missing on old runtimes: the function then has `cancel` only
const disposeSymbol: symbol | undefined = Reflect.get(Symbol, "dispose");

/**
 * Makes a policy (or any task) a plain function that needs no bus and no
 * context. The returned function keeps the state of the policy between calls,
 * so a debounced one waits across calls. `cancel()` aborts what is pending or
 * running; calls after it work again. The callback keeps the `(payload, ctx)`
 * shape; `ctx.signal`, `ctx.abort` and `ctx.run` work, `ctx.emit` and `ctx.on`
 * do nothing because there is no bus.
 *
 * @example
 * ```ts
 * const onChange = withPolicy(debounce(300, (query: string) => search(query)));
 *
 * onChange("re");
 * onChange("redux"); // only this one runs, 300 ms after it
 * onChange.cancel(); // or nothing runs at all
 * ```
 */
export const withPolicy = <P, R>(
	task: Task<P, EventMap, R>,
): PolicyFunction<P, R> => {
	let controller = new AbortController();

	const call = async (
		...args: PayloadOf<P>
	): Promise<Awaited<R> | undefined> => {
		const payload = args[0] as P;
		const { ctx, unlink } = createTask<EventMap>({
			event: { type: "withPolicy", payload },
			parent: { signal: controller.signal },
		});

		try {
			return await task(payload, ctx);
		} finally {
			unlink();
		}
	};

	// a new controller, because policies refuse a signal that is aborted already
	const cancel = (reason?: unknown) => {
		controller.abort(reason);
		controller = new AbortController();
	};

	const result: PolicyFunction<P, R> = Object.assign(call, { cancel });
	if (disposeSymbol) {
		Reflect.set(result, disposeSymbol, () => cancel());
	}

	return result;
};
