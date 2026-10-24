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

// kept on the context, so that a child (`ctx.run`) and a module can find what the task was given:
// the layers of the call, and the scope of the module that owns the handler
const callKey = Symbol("nanoeffects.scope.call");
const moduleKey = Symbol("nanoeffects.scope.module");
// marks the function that wraps `ctx.run` here, so a context is wrapped only once
const watchedKey = Symbol("nanoeffects.scope.watched");

// a function that wraps `ctx.run` here
type ChildTask = (payload: unknown, child: Ctx) => unknown;
type Watched = ((fn: ChildTask, ...rest: unknown[]) => unknown) & {
	[watchedKey]?: boolean;
};

const none: Layers = [];

// the value is read each time, so a scope that is changed later is used as it is now
const put = (ctx: Ctx, layer: Scope | undefined) => {
	if (!layer) {
		return;
	}
	for (const key in layer) {
		if (key !== "effects" && !reserved.has(key)) {
			const value = layer[key];
			const effect = value as Loose;
			ctx[key] =
				typeof value === "function" && marked.has(value)
					? bindTo(ctx, effect)
					: value;
		}
	}
	const effects = layer.effects;
	if (effects) {
		for (const key in effects) {
			const effect = effects[key] as Loose;
			if (!reserved.has(key)) {
				ctx[key] = bindTo(ctx, effect);
			}
		}
	}
};

const bindTo =
	(ctx: Ctx, fn: Loose) =>
	(...args: unknown[]) =>
		fn(ctx, ...args);

// weakest first: the module, then the layers of the call
const refresh = (ctx: Ctx, call: Layers, module: Scope | undefined) => {
	put(ctx, module);
	for (const layer of call) {
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

// the event type an emit is for, and its payload
const typeOf = (event: unknown) =>
	isObject(event) || typeof event === "function" ? (event as Ctx).type : event;
const payloadOf = (event: unknown, rest: unknown[]) =>
	isObject(event) ? event.payload : rest[0];

// the layers an emit carries: the scope of its action or command, and the one it was given
const layersOf = (own: Scope | undefined, explicit: Scope | undefined) => {
	const layers = own && explicit ? [own, explicit] : [own ?? explicit];

	return layers as Layers;
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
		// the emit that is running, only while its tasks are made: the layers it carries and
		// the event they are for. A context is matched to the emit by the type and the payload
		// it has (the core says nothing else about who made it). A task of the same type and
		// payload that something else makes during the emit would take the layers too; a hook
		// in the core would remove the guess.
		let pendingLayers: Layers | undefined;
		let pendingType: unknown;
		let pendingPayload: unknown;

		// a child that `ctx.run` makes takes the layers of its parent, bound to itself
		const watchRun = (ctx: Ctx) => {
			const run = ctx.run as Watched;
			if (run[watchedKey]) {
				return;
			}
			const watched: Watched = (fn: ChildTask, ...rest: unknown[]) => {
				const outer = pendingLayers;
				// the child is not a task of the emit that may be running
				pendingLayers = void 0;
				try {
					return run(
						(payload: unknown, child: Ctx) => {
							const call = ctx[callKey] as Layers | undefined;
							const module = ctx[moduleKey] as Scope | undefined;
							if (call) {
								adopt(child, call, module);
							}
							return fn(payload, child);
						},
						...rest,
					);
				} finally {
					pendingLayers = outer;
				}
			};
			watched[watchedKey] = true;
			ctx.run = watched;
		};

		const adopt = (ctx: Ctx, call: Layers, module: Scope | undefined) => {
			ctx[callKey] = call;
			if (module) {
				ctx[moduleKey] = module;
			}
			refresh(ctx, call, module);
			watchRun(ctx);
		};

		const previous = bus.addContext;
		bus.addContext = (target) => {
			previous?.(target);
			const ctx = target as Ctx;
			if (
				pendingLayers &&
				ctx.type === pendingType &&
				Object.is(ctx.payload, pendingPayload)
			) {
				adopt(ctx, pendingLayers, void 0);
			}
		};

		bus.applyScope = (target, scope) => {
			const ctx = target as Ctx;
			adopt(ctx, (ctx[callKey] as Layers | undefined) ?? none, scope);
		};

		bus.fitScope = (scope, fn) => (payload: unknown, ctx: object) => {
			bus.applyScope?.(ctx, scope);
			return Reflect.apply(fn, null, [payload, ctx]);
		};

		const original: unknown = bus.emit;
		const emit = original as Loose;
		const scoped: Loose = (event, ...rest) => {
			const isCall = isObject(event);
			const own = scopeOf(event);
			const explicit = isCall ? (rest[0] as Scope | undefined) : void 0;
			// nothing to set and nothing to clear: a plain emit costs one call more
			if (!(own || explicit || pendingLayers)) {
				return emit(event, ...rest);
			}

			const outerLayers = pendingLayers;
			const outerType = pendingType;
			const outerPayload = pendingPayload;
			pendingLayers = own || explicit ? layersOf(own, explicit) : void 0;
			pendingType = typeOf(event);
			pendingPayload = payloadOf(event, rest);
			try {
				return isCall ? emit(event) : emit(event, ...rest);
			} finally {
				pendingLayers = outerLayers;
				pendingType = outerType;
				pendingPayload = outerPayload;
			}
		};
		const loose: unknown = scoped;
		bus.emit = loose as Emit<E>;

		return bus;
	};
