// What the rules flag (the first four) and what they leave alone (the rest).
declare const latest: (fn: unknown) => unknown;
declare const debounce: (ms: number, fn: unknown) => unknown;
declare const queue: (fn: unknown) => unknown;
declare const api: { search: (query: string, options?: unknown) => Promise<unknown> };
declare function namedHandler(): void;

// flagged: no ctx parameter
latest(async (query: string) => api.search(query));
latest(async () => api.search(""));
debounce(300, (query: string) => api.search(query));
queue(async function (draft: string) {
	return api.search(draft);
});

// fine: the context is a parameter
latest(async (query: string, ctx: { signal: AbortSignal }) => api.search(query, { signal: ctx.signal }));
debounce(300, async (query: string, { signal }: { signal: AbortSignal }) => api.search(query, { signal }));
// fine: a handler that is not written in place cannot be read by a rule
latest(namedHandler);
