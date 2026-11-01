// @ts-check
// The functions below are typed with JSDoc, so the rule can read them when it has type information.

/** @param {string} query @param {{ signal?: AbortSignal }} [options] */
const searchGood = (query, options = {}) => fetch(`/search?q=${query}`, { signal: options.signal });
/** @param {string} query @param {{ signal?: AbortSignal }} [options] */
const searchIgnores = (query, _options = {}) => fetch(`/search?q=${query}`);
/** @param {string} query @param {AbortSignal} [signal] */
const streamGood = (query, signal) => fetch(`/stream?q=${query}`, { signal });
/** @param {string} query @param {AbortSignal} [signal] */
const streamIgnores = (query, _signal) => fetch(`/stream?q=${query}`);
/** @param {number} id @param {{ signal?: AbortSignal }} [options] */
const loadGood = (id, { signal } = {}) => fetch(`/user/${id}`, { signal });
/** @param {number} id @param {{ signal?: AbortSignal, retries?: number }} [options] */
const loadIgnores = (id, { retries } = {}) => fetch(`/user/${id}?retries=${retries}`);
/** @param {string} query @param {{ signal?: AbortSignal }} [options] */
const viaHelperGood = (query, options) => searchGood(query, options);
/** @param {string} query @param {{ signal?: AbortSignal }} [options] */
const viaHelperIgnores = (query, options) => searchIgnores(query, options);
/** @param {string} query @param {{ signal?: AbortSignal, retries?: number }} [options] */
const onlyOtherOptions = (query, options = {}) => fetch(`/x?q=${query}&retries=${options.retries}`);
/** @param {string} key */
const cacheGet = (key) => Promise.resolve(key);
/** @type {any} */
const anyApi = {};

// flagged: the function takes a signal and this call does not pass it
latest(async (query, ctx) => {
	const first = await searchGood(query);
	return first;
});
latest(async (id, ctx) => loadGood(id));

// flagged: the signal is passed, and the function never uses it
latest(async (query, ctx) => searchIgnores(query, { signal: ctx.signal }));
latest(async (query, ctx) => streamIgnores(query, ctx.signal));
latest(async (id, ctx) => loadIgnores(id, { signal: ctx.signal }));
latest(async (query, ctx) => viaHelperIgnores(query, { signal: ctx.signal }));
latest(async (query, ctx) => onlyOtherOptions(query, { signal: ctx.signal }));

// flagged: nothing is known about the function, so a call with no signal is reported
latest(async (query, ctx) => anyApi.search(query));

// fine: the function takes no signal, so it cannot be cancelled and needs none
latest(async (query, ctx) => {
	const cached = await cacheGet(query);
	const items = await searchGood(query, { signal: ctx.signal });
	return { cached, items };
});

// fine: the signal is passed and the function uses it
latest(async (query, ctx) => searchGood(query, { signal: ctx.signal }));
latest(async (query, ctx) => streamGood(query, ctx.signal));
latest(async (id, ctx) => loadGood(id, { signal: ctx.signal }));
latest(async (query, ctx) => viaHelperGood(query, { signal: ctx.signal }));
latest(async (query, ctx) => anyApi.search(query, { signal: ctx.signal }));
latest(async (query, ctx) => fetch(`/x?q=${query}`, { signal: ctx.signal }));
