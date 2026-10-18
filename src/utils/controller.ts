import { onAbort } from "./onAbort";

/**
 * Creates an `AbortController` that aborts together with `parent`, with the
 * parent's reason. `unlink` removes the listener from `parent`; call it when
 * the controller is no longer needed so a long-lived `parent` does not keep it.
 *
 * @example
 * ```ts
 * const { controller, unlink } = linkedController(ctx.signal);
 *
 * try {
 *   await fetch(url, { signal: controller.signal });
 * } finally {
 *   unlink();
 * }
 * ```
 */
export const linkedController = (parent?: AbortSignal) => {
	const controller = new AbortController();
	const unlink = onAbort(
		{
			signal: parent,
		},
		(reason) => controller.abort(reason),
	);

	return { controller, unlink };
};
