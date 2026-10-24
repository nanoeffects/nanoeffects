import type { Bus, Emit } from "../core/bus";
import { scopeKey } from "../core/scope-key";
import type { Scope } from "../core/scope-types";
import type { EventMap } from "../core/types";
import { marked } from "./effect";

// the library's own fields of a context: no scope replaces them
const reserved = new Set([
	"signal",
	"abort",
	"emit",
	"on",
	"off",
	"run",
	"type",
	"payload",
]);

// a task context as this file touches it: plain properties, because it runs for every task
type Ctx = Record<string | symbol, unknown>;

type Loose = (...args: unknown[]) => unknown;

type Layers = readonly Scope[];

// what the task contexts of the emit that is running take, and the event they are for
type Pending = { type: string; payload: unknown; layers: Layers };

// the layers of a task: from the call (action, command, `emit`), and from the module that owns the handler
type Entry = { call: Layers; module: Scope | undefined };

// kept on the context, so that a child (`ctx.run`) and a module can find what the task was given
const entryKey = Symbol("nanoeffects.scope.entry");

const none: Layers = [];

// the functions that wrap `ctx.run` here, so a context is wrapped only once
const wrappers = new WeakSet<object>();

// the value is read each time, so a scope that is changed later is used as it is now
const put = (ctx: Ctx, layer: Scope | undefined) => {
	if (!layer) {
		return;
	}
	for (const key of Object.keys(layer)) {
		const value = layer[key];
		if (key !== "effects" && !reserved.has(key)) {
			const effect = value as Loose;
			ctx[key] =
				typeof value === "function" && marked.has(value)
					? bindTo(ctx, effect)
					: value;
		}
	}
	const effects = layer.effects ?? {};
	for (const key of Object.keys(effects)) {
		const effect = effects[key] as Loose;
		if (!reserved.has(key)) {
			ctx[key] = bindTo(ctx, effect);
		}
	}
};

const bindTo =
	(ctx: Ctx, fn: Loose) =>
	(...args: unknown[]) =>
		fn(ctx, ...args);

// weakest first: the module, then the layers of the call
const refresh = (ctx: Ctx, entry: Entry) => {
	put(ctx, entry.module);
	for (const layer of entry.call) {
		put(ctx, layer);
	}
};

const scopeOf = (target: unknown): Scope | undefined => {
	if (
		(typeof target === "object" && target !== null) ||
		typeof target === "function"
	) {
		return Reflect.get(target, scopeKey);
	}
};

const isObject = (value: unknown): value is Ctx =>
	typeof value === "object" && value !== null;

// what an emit asks of the tasks it starts: the layers it carries and the event they are for
const askOf = (event: unknown, rest: unknown[]): Pending | undefined => {
	const own = scopeOf(event);
	const explicit = isObject(event) ? (rest[0] as Scope | undefined) : void 0;
	if (!(own || explicit)) {
		return;
	}
	const layers = own && explicit ? [own, explicit] : [own ?? explicit];
	const named = typeof event === "string" ? event : (event as Ctx).type;

	return {
		type: named as string,
		payload: isObject(event) ? event.payload : rest[0],
		layers: layers as Layers,
	};
};

/**
 * Switches scopes on for a bus: the scope given to a command, a job, an
 * action or a module (an object whose keys go on `ctx`, with `effects` bound to
 * the task), and the second argument of `emit`, put fields on
 * the context of the tasks they are for. A stronger layer replaces a field of
 * the same name: `emit`, then action / command / job, then module, then the bus.
 * Fields of the library (`signal`, `emit`, `run`, …) are never replaced. Returns
 * the same bus.
 *
 * Use it after `effectsPlugin`, which assigns its effects over those of a scope
 * when it comes later, and before `modulePlugin`, which mounts its modules when
 * it is used. Without this plugin a scope is ignored.
 *
 * @example
 * ```ts
 * import { createBus } from "nanoeffects";
 * import { createCommand } from "nanoeffects/actions";
 * import { scopePlugin } from "nanoeffects/scope";
 *
 * const bus = createBus().use(scopePlugin()); // scopes work on this bus
 *
 * const getUser = createCommand("user/get", (id: string, { http }) => http.get(id), {
 *   http, // a field of this command only
 * });
 * bus.emit(getUser("1"), { http: fakeHttp }); // this call only
 * ```
 */
export const scopePlugin =
	() =>
	<E extends EventMap>(bus: Bus<E>): Bus<E> => {
		// the emit that is running, only while its tasks are made
		let pending: Pending | undefined;

		// a child that `ctx.run` makes takes the layers of its parent, bound to itself
		const watchRun = (ctx: Ctx) => {
			const run = ctx.run as Loose;
			if (wrappers.has(run)) {
				return;
			}
			const watched = (fn: Loose, ...rest: unknown[]) => {
				const outer = pending;
				// the child is not a task of the emit that may be running
				pending = void 0;
				try {
					return run(
						(payload: unknown, child: Ctx) => {
							const owner = ctx[entryKey] as Entry | undefined;
							if (owner) {
								adopt(child, owner.call, owner.module);
							}
							return fn(payload, child);
						},
						...rest,
					);
				} finally {
					pending = outer;
				}
			};
			wrappers.add(watched);
			ctx.run = watched;
		};

		const adopt = (ctx: Ctx, call: Layers, module: Scope | undefined) => {
			const entry = { call, module };
			ctx[entryKey] = entry;
			refresh(ctx, entry);
			watchRun(ctx);
		};

		const previous = bus.addContext;
		bus.addContext = (target) => {
			previous?.(target);
			const ctx = target as Ctx;
			if (
				pending &&
				ctx.type === pending.type &&
				Object.is(ctx.payload, pending.payload)
			) {
				adopt(ctx, pending.layers, void 0);
			}
		};

		bus.applyScope = (target, scope) => {
			const ctx = target as Ctx;
			const call = (ctx[entryKey] as Entry | undefined)?.call ?? none;
			adopt(ctx, call, scope);
		};

		bus.fitScope = (scope, fn) => (payload: unknown, ctx: object) => {
			bus.applyScope?.(ctx, scope);
			return Reflect.apply(fn, null, [payload, ctx]);
		};

		const original: unknown = bus.emit;
		const emit = original as Loose;
		const scoped: Loose = (event, ...rest) => {
			const ask = askOf(event, rest);
			// nothing to set and nothing to clear: a plain emit costs one call more
			if (!(ask || pending)) {
				return emit(event, ...rest);
			}

			const outer = pending;
			pending = ask;
			try {
				return isObject(event) ? emit(event) : emit(event, ...rest);
			} finally {
				pending = outer;
			}
		};
		const loose: unknown = scoped;
		bus.emit = loose as Emit<E>;

		return bus;
	};
