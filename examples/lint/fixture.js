// What the rules flag and what they leave alone. The rules read the syntax, so the names below are not declared.

// flagged: no ctx parameter
latest(async (query) => api.search(query));
latest(async () => api.search(""));
debounce(300, (query) => api.search(query));
queue(async function (draft) {
	return api.search(draft);
});

// flagged: a step that waits for a call without the signal, also when another step passes it
latest(async (query, ctx) => {
	const news = await api.news(query);
	const posts = await api.posts(query, { signal: ctx.signal });
	ctx.emit("results", { news, posts });
});
latest(async (query, ctx) => {
	await api.search(query);
});
latest(async (query, ctx) => api.search(query));
debounce(300, async (query, { emit }) => {
	emit("results", await api.search(query));
});
latest(async (query, { signal }) => {
	const first = await api.first(query, { signal });
	const second = await api.second(query);
	return [first, second];
});

// flagged: the signal is hard to pass, and easy to forget
latest(async (query, ctx) => {
	for await (const chunk of api.stream(query)) {
		ctx.emit("chunk", chunk);
	}
});
latest(async (query, ctx) => {
	await new Promise((resolve) => setTimeout(resolve, 1000));
	return api.search(query, { signal: ctx.signal });
});
latest(async (query, ctx) => {
	const [news, posts] = await Promise.all([api.news(query, { signal: ctx.signal }), api.posts(query)]);
	ctx.emit("results", { news, posts });
});
latest(async (ids, ctx) => {
	return Promise.all(ids.map((id) => api.user(id)));
});
latest(async (query, ctx) => {
	return retry(ctx, () => api.search(query));
});
latest(async (query, ctx) => {
	return timeout(ctx, 1000, (child) => api.search(query));
});
latest(async (query, ctx) => {
	return api.news(query).then((response) => response.json());
});
latest(async (query, ctx) => {
	return fetch(`/api?q=${query}`, { signal: AbortSignal.timeout(5000) });
});
latest(async (query, ctx) => {
	const controller = new AbortController();
	return fetch(`/api?q=${query}`, { signal: controller.signal });
});

// flagged: bus.emit is not dropped after the policy cancels the handler, so a stale call still delivers
latest(async (query, ctx) => {
	const items = await api.search(query, { signal: ctx.signal });
	bus.emit("results", items);
});

// fine: every step passes the signal on
latest(async (query, ctx) => api.search(query, { signal: ctx.signal }));
debounce(300, async (query, { signal }) => api.search(query, { signal }));
latest(async (query, ctx) => {
	const { signal } = ctx;
	const news = await api.news(query, { signal });
	const posts = await api.posts(query, { signal });
	return { news, posts };
});
latest(async (query, ctx) => {
	const response = await fetch(`/api?q=${query}`, { signal: ctx.signal });
	return response.json();
});

// fine: the signal is kept in a variable, an options object, or another name
latest(async (query, ctx) => {
	const own = ctx.signal;
	return api.search(query, { signal: own });
});
latest(async (query, ctx) => {
	const options = { signal: ctx.signal, retries: 2 };
	const news = await api.news(query, options);
	return api.posts(query, { ...options, page: 2 });
});
latest(async (query, { signal: abort }) => api.search(query, { signal: abort }));

// fine: calls that run together each pass it
latest(async (query, ctx) => {
	const [news, posts] = await Promise.all([
		api.news(query, { signal: ctx.signal }),
		api.posts(query, { signal: ctx.signal }),
	]);
	ctx.emit("results", { news, posts });
});
latest(async (ids, ctx) => Promise.all(ids.map((id) => api.user(id, { signal: ctx.signal }))));

// fine: the whole ctx goes to an effect, and the call inside the effect passes the signal
latest(async (query, ctx) => retry(ctx, () => api.search(query, { signal: ctx.signal })));
latest(async (query, ctx) => timeout(ctx, 1000, (child) => api.search(query, child)));
latest(async (query, ctx) => {
	await delay(ctx, 100);
	return ctx.run((child) => api.search(query, child));
});

// fine: the handler wires the signal by hand
latest(async (query, ctx) => {
	const request = legacy.start(query);
	ctx.signal.addEventListener("abort", () => request.cancel());
	return request.done;
});

// fine: a handler that is not written in place cannot be read by a rule
latest(namedHandler);
