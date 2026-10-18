/** Duck-typed Promise / thenable check (not `instanceof Promise`). */
export const isPromise = <T>(
	value: T,
): value is T & PromiseLike<Awaited<T>> => {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return "then" in value && typeof value.then === "function";
};

/** Runs `done` now for sync values, or after the promise settles. */
export const after = <T>(
	value: T,
	done: () => void,
): T | Promise<Awaited<T>> => {
	if (isPromise(value)) {
		return Promise.resolve(value).finally(done);
	}
	done();
	return value;
};
