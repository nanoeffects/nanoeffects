import { useEffect, useMemo, useRef } from "react";
import type { EventMap, Task } from "../core/types";
import { type PolicyFunction, withPolicy } from "../policies/with-policy";

/**
 * A policy (`debounce`, `throttle`, `latest`, ...) as one stable function for a
 * component. A policy made in the body of a component is made again on every
 * render and loses its timer; made once, it keeps the callback of the first
 * render. This hook keeps the policy across renders and calls the `callback` of
 * the latest render, so an inline callback sees fresh props and state.
 *
 * `make` builds the policy around the callback. Pass a policy called without
 * its task (`debounce(300)`, `latest()`), or a function `(task) => policy` for
 * a combined policy such as `(task) => throttle(100, latest(task))`; `task`
 * runs the callback. `make` runs once, and again when an item of `deps`
 * changes: list there what it reads, such as the wait time. The pending calls of the old function are
 * cancelled then, and when the component unmounts. Needs `react` 18 or newer.
 *
 * @example
 * ```tsx
 * import { debounce } from "nanoeffects/policies";
 * import { usePolicy } from "nanoeffects/react";
 *
 * const Search = ({ wait }: { wait: number }) => {
 *   const [results, setResults] = useState([]);
 *   const onChange = usePolicy(
 *     async (query: string) => setResults(await search(query)), // latest render's callback
 *     debounce(wait), // the policy, made once per wait
 *     [wait],
 *   );
 *   return <input onChange={(event) => onChange(event.target.value)} />;
 * };
 * ```
 */
export const usePolicy = <P, R, S = R>(
	callback: Task<P, EventMap, R>,
	make: (task: Task<P, EventMap, R>) => Task<P, EventMap, S>,
	deps: readonly unknown[] = [],
): PolicyFunction<P, S> => {
	const latest = useRef(callback);

	// read when a call runs, so the policy never holds a callback of an old render
	useEffect(() => {
		latest.current = callback;
	});

	// `make` is not a dependency: a new function on every render must not reset the policy
	const policy = useMemo(() => {
		const task: Task<P, EventMap, R> = (payload, ctx) =>
			latest.current(payload, ctx);

		return withPolicy(make(task));
		// biome-ignore lint/correctness/useExhaustiveDependencies: the caller lists what `make` reads
	}, deps);

	// runs on unmount and when `deps` make a new policy; cancel() leaves it usable for StrictMode
	useEffect(() => () => policy.cancel(), [policy]);

	return policy;
};
