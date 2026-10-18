import { onAbort, report } from "../utils";

export type CancellableHandle<T> = {
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
	/** Registers a cleanup that runs if the promise is cancelled before it settles. */
	onCancel: (cleanup: () => void) => void;
};

export type CancellableExecutor<T> = (handle: CancellableHandle<T>) => void;

/**
 * A promise tied to `ctx.signal`. It works like `new Promise`, but the
 * executor gets one object, `{ resolve, reject, onCancel }`. If the signal
 * aborts before the promise settles, the cleanups run (last registered first)
 * and the promise rejects with the abort reason. If the signal is already
 * aborted, the executor does not run. After the promise settles, the abort
 * listener is removed and the cleanups are dropped.
 *
 * @example
 * ```ts
 * bus.on(
 *   "wait",
 *   latest((_, ctx) =>
 *     cancellable<void>(({ resolve, onCancel }) => {
 *       const timer = setTimeout(resolve, 5000);
 *       onCancel(() => clearTimeout(timer));
 *     }, ctx),
 *   ),
 * );
 * ```
 */
export const cancellable = <T>(
	executor: CancellableExecutor<T>,
	ctx: { signal: AbortSignal },
): Promise<T> => {
	if (ctx.signal.aborted) {
		return Promise.reject(ctx.signal.reason);
	}

	return new Promise<T>((resolve, reject) => {
		const cleanups: Array<() => void> = [];
		let state: "pending" | "cancelled" | "settled" = "pending";

		const runCleanup = (cleanup: () => void) => {
			try {
				cleanup();
			} catch (error) {
				report("cancel cleanup failed", error);
			}
		};

		const stopListening = onAbort((reason) => {
			state = "cancelled";
			for (const cleanup of cleanups.reverse()) {
				runCleanup(cleanup);
			}
			reject(reason);
		}, ctx);

		const once =
			<A extends unknown[]>(settle: (...args: A) => void) =>
			(...args: A) => {
				if (state === "pending") {
					state = "settled";
					stopListening();
					cleanups.length = 0;
					settle(...args);
				}
			};

		const onCancel = (cleanup: () => void) => {
			if (state === "pending") {
				cleanups.push(cleanup);
			} else if (state === "cancelled") {
				runCleanup(cleanup);
			}
		};

		try {
			executor({ resolve: once(resolve), reject: once(reject), onCancel });
		} catch (error) {
			once(reject)(error);
		}
	});
};
