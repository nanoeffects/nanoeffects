// What the rules flag and what they leave alone. The rules read the syntax, so the names below are not declared.

// flagged: no ctx parameter (the first four)
latest(async (query) => api.search(query));
latest(async () => api.search(""));
debounce(300, (query) => api.search(query));
queue(async function (draft) {
	return api.search(draft);
});

// flagged: ctx is taken and the signal is lost
latest(async (query, ctx) => {
	const items = await api.search(query);
	ctx.emit("results", items);
});
latest(async (query, _ctx) => {
	await api.search(query);
});
debounce(300, async (query, { emit }) => {
	emit("results", await api.search(query));
});

// fine: the signal is passed on
latest(async (query, ctx) => api.search(query, { signal: ctx.signal }));
debounce(300, async (query, { signal }) => api.search(query, { signal }));
latest(async (query, ctx) => {
	const { signal } = ctx;
	return api.search(query, { signal });
});
// fine: the whole ctx goes to an effect, or ctx.run keeps the link
latest(async (query, ctx) => retry(ctx, () => api.search(query)));
latest(async (_query, ctx) => ctx.run(() => api.search("")));
// fine: a handler that is not written in place cannot be read by a rule
latest(namedHandler);
