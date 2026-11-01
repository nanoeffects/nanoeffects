// TypeScript constructs for the rule with type information: generics, overloads, classes, interfaces, rest lists.
// Lines are marked "flagged" or "fine" in the comment above each handler.
declare const latest: (handler: (value: string, ctx: Ctx) => unknown) => unknown;
type Ctx = { signal: AbortSignal; emit: (name: string, value: unknown) => void };
type Options = { signal?: AbortSignal; retries?: number };

// a generic function that forwards the signal, and one that takes it and drops it
const mapped = <T>(url: string, options: Options & { map: (raw: unknown) => T }): Promise<T> =>
	fetch(url, { signal: options.signal ?? null }).then((response) => options.map(response));
const mappedDrops = <T>(url: string, options: Options & { map: (raw: unknown) => T }): Promise<T> =>
	fetch(url).then((response) => options.map(response));

// overloads: only the second takes a signal, and the implementation uses it
function load(id: number): Promise<string>;
function load(id: number, options: Options): Promise<string>;
function load(id: number, options?: Options): Promise<string> {
	return fetch(`/user/${id}`, { signal: options?.signal ?? null }).then((response) => response.text());
}
// overloads with an implementation that drops the signal
function loadDrops(id: number): Promise<string>;
function loadDrops(id: number, options: Options): Promise<string>;
function loadDrops(id: number, _options?: Options): Promise<string> {
	return fetch(`/user/${id}`).then((response) => response.text());
}

// a class: a method that forwards, one that drops, and one that takes no signal
class Api {
	private readonly base: string;
	constructor(base: string) {
		this.base = base;
	}
	search(query: string, options?: Options): Promise<Response> {
		return fetch(`${this.base}/search?q=${query}`, { signal: options?.signal ?? null });
	}
	searchDrops(query: string, options?: Options): Promise<Response> {
		return fetch(`${this.base}/search?q=${query}`);
	}
	count(query: string): Promise<number> {
		return Promise.resolve(query.length);
	}
}
const api = new Api("/api");

// an interface: no body to read, so a signal that is passed is trusted, and one that is missing is reported
interface Http {
	get(url: string, init?: Options): Promise<Response>;
	head(url: string): Promise<Response>;
}
declare const http: Http;

// lib types: RequestInit carries a signal; a plain string does not
declare function request(url: string, init?: RequestInit): Promise<Response>;
declare function logIt(message: string): Promise<void>;
// a type alias for a function, a tuple in a rest list, an unknown callee
type Fetcher = (url: string, signal?: AbortSignal) => Promise<unknown>;
declare const fetcher: Fetcher;
declare function viaRest(...args: [string, Options?]): Promise<unknown>;
declare const unknownApi: any;
// a signal that may be null or undefined
declare function nullable(url: string, signal: AbortSignal | null): Promise<unknown>;
// the parameter is read for another option only
const onlyRetries = (url: string, options: Options = {}): Promise<Response> => fetch(`${url}?r=${options.retries}`);

// flagged: the function takes a signal and the call does not pass it
latest(async (query, ctx) => api.search(query));
latest(async (query, ctx) => http.get(query));
latest(async (query, ctx) => request(query));
latest(async (query, ctx) => fetcher(query));
latest(async (query, ctx) => viaRest(query));
latest(async (query, ctx) => nullable(query, null));
latest(async (query, ctx) => load(1));
latest(async (query, ctx) => mapped(query, { map: (raw) => raw }));
latest(async (query, ctx) => unknownApi.search(query));

// flagged: the signal is passed and the function drops it
latest(async (query, ctx) => api.searchDrops(query, { signal: ctx.signal }));
latest(async (query, ctx) => mappedDrops(query, { signal: ctx.signal, map: (raw) => raw }));
latest(async (query, ctx) => loadDrops(1, { signal: ctx.signal }));
latest(async (query, ctx) => onlyRetries(query, { signal: ctx.signal }));

// fine: the function cannot be cancelled, so the call needs no signal
latest(async (query, ctx) => api.count(query));
latest(async (query, ctx) => http.head(query));
latest(async (query, ctx) => logIt(query));

// fine: the signal is passed and the function uses it, or cannot be read
latest(async (query, ctx) => api.search(query, { signal: ctx.signal }));
latest(async (query, ctx) => http.get(query, { signal: ctx.signal }));
latest(async (query, ctx) => request(query, { signal: ctx.signal }));
latest(async (query, ctx) => fetcher(query, ctx.signal));
latest(async (query, ctx) => viaRest(query, { signal: ctx.signal }));
latest(async (query, ctx) => nullable(query, ctx.signal));
latest(async (query, ctx) => load(1, { signal: ctx.signal }));
latest(async (query, ctx) => mapped(query, { signal: ctx.signal, map: (raw) => raw }));
latest(async (query, ctx) => unknownApi.search(query, { signal: ctx.signal }));
