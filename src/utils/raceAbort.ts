import { onAbort } from "./onAbort";

/**
 * Settles like `work`, but rejects with the abort reason as soon as
 * `ctx.signal` aborts, even if `work` ignores the signal. Without a signal it
 * returns `work` as is.
 */
export const raceAbort = <T>(
	work: Promise<T>,
	ctx?: { signal?: AbortSignal | undefined },
): Promise<T> =>
	ctx?.signal
		? new Promise<T>((resolve, reject) => {
				const off = onAbort(ctx, reject);
				work.then(resolve, reject).finally(off);
			})
		: work;
