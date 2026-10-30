/**
 * Tells the `ctx` form of an effect from the form that returns a starter. A
 * context is an object (`{}` is one); the first argument of the other form is
 * a number, a string or a function, so the two never meet.
 */
export const isContext = (
	value: unknown,
): value is { signal?: AbortSignal | undefined } =>
	typeof value === "object" && value !== null;
