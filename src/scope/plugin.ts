import type { Bus, Emit } from "../core/bus";
import type { SignalFirst } from "../core/effect-types";
import { scopeKey } from "../core/scope-key";
import type { Scope } from "../core/scope-types";
import type { EventMap } from "../core/types";
import { marked } from "./effect";
import type { ScopeSlots } from "./types";

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
	// read by the tracer, not a field of the context
	"traceGroupId",
]);

type Layers = readonly Scope[];
const none: Layers = [];

// kept on the context, so that a child (`ctx.run`) and a module can find what the task was given:
// the layers of the call, and the scope of the module that owns the handler
const callKey = Symbol("nanoeffects.scope.call");
const moduleKey = Symbol("nanoeffects.scope.module");
// marks the function that wraps `ctx.run` here, so a context is wrapped only once
const watchedKey = Symbol("nanoeffects.scope.watched");

// the handler of a child task, and `ctx.run` as it is called with one
type ChildTask = (payload: unknown, child: Ctx) => unknown;
type Run = ((task: ChildTask, ...rest: unknown[]) => unknown) & {
	[watchedKey]?: boolean;
};

// A task context as this file touches it. It is plain properties on purpose: this runs for
// every task. The fields of the scope are the index signature.
interface Ctx {
	[field: string]: unknown;
	type: unknown;
	payload: unknown;
	run: Run;
	[callKey]?: Layers;
	[moduleKey]?: Scope;
}

// The one place where the object that the core hands to `addContext` is taken as a context.
const ctxOf = (target: object) => target as Ctx;

// Whether a value of a scope was marked by `effect`, so it is bound to the task.
const isMarked = (value: unknown): value is SignalFirst =>
	typeof value === "function" && marked.has(value);

// The effect with the task given first, as a function of the rest of the arguments.
const bindTo =
	(ctx: Ctx, effect: SignalFirst) =>
	(...args: unknown[]) =>
		Reflect.apply(effect, null, [ctx, ...args]);

// the value is read each time, so a scope that is changed later is used as it is now
const put = (ctx: Ctx, layer: Scope | undefined) => {
	if (!layer) {
		return;
	}
	for (const key in layer) {
		if (key !== "$effects" && !reserved.has(key)) {
			const value = layer[key];
			ctx[key] = isMarked(value) ? bindTo(ctx, value) : value;
		}
	}
	const effects = layer.$effects;
	if (effects) {
		for (const key in effects) {
			const effect = effects[key];
			if (effect && !reserved.has(key)) {
				ctx[key] = bindTo(ctx, effect);
			}
		}
	}
};

// weakest first: the module, then the layers of the call
const refresh = (ctx: Ctx, call: Layers, module: Scope | undefined) => {
	put(ctx, module);
	for (const layer of call) {
		put(ctx, layer);
	}
};

const isObject = (value: unknown): value is object =>
	typeof value === "object" && value !== null;

// a scope is an object; anything else in the place of one is not taken for a scope
const isScope = (value: unknown): value is Scope => isObject(value);

// `bus.emit` as this file calls it
type Emitter = (event: unknown, ...rest: unknown[]) => unknown;

// something with a type, as an event is: an action, a command call or a command
type Named = { type: unknown; payload?: unknown };
const isNamed = (value: unknown): value is Named =>
	(isObject(value) || typeof value === "function") && "type" in value;

// the event an emit is for: its type, and its payload (a command that is emitted by itself has it as the next argument)
const typeOf = (event: unknown) => (isNamed(event) ? event.type : event);
const payloadOf = (event: unknown, rest: unknown[]) =>
	isObject(event) && isNamed(event) ? event.payload : rest[0];

// the scope that an action or a command carries
const scopeOf = (event: unknown): Scope | undefined =>
	isObject(event) || typeof event === "function"
		? Reflect.get(event, scopeKey)
		: void 0;

// the layers an emit carries: the scope of its action or command, then the one it was given
const layersFor = (event: unknown, rest: unknown[]): Layers | undefined => {
	const own = scopeOf(event);
	const explicit = isObject(event) && isScope(rest[0]) ? rest[0] : void 0;
	if (own && explicit) {
		return [own, explicit];
	}
	const only = own ?? explicit;

	return only ? [only] : void 0;
};

/**
 * Switches scopes on for a bus: the scope given to a command, a job, an
 * action or a module (an object whose keys go on `ctx`, with `$effects` bound to
 * the task), and the second argument of `emit`, put fields on
 * the context of the tasks they are for. A stronger layer replaces a field of
 * the same name: `emit`, then action / command / job, then module, then the bus.
 * Fields of the library (`signal`, `emit`, `run`, …) are never replaced. Returns
 * the same bus.
 *
 * It works in any order with the other plugins. Without this plugin a scope is
 * ignored.
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
	<E extends EventMap>(bus: Bus<E> & ScopeSlots): Bus<E> & ScopeSlots => {
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
			const run = ctx.run;
			if (run[watchedKey]) {
				return;
			}
			const watched: Run = (task, ...rest) => {
				const outer = pendingLayers;
				// the child is not a task of the emit that may be running
				pendingLayers = void 0;
				try {
					return run(
						(payload, child) => {
							const call = ctx[callKey];
							if (call) {
								adopt(child, call, ctx[moduleKey]);
							}
							return task(payload, child);
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
			const ctx = ctxOf(target);
			if (
				pendingLayers &&
				ctx.type === pendingType &&
				Object.is(ctx.payload, pendingPayload)
			) {
				adopt(ctx, pendingLayers, void 0);
			}
		};

		bus.applyScope = (target, scope) => {
			const ctx = ctxOf(target);
			adopt(ctx, ctx[callKey] ?? none, scope);
		};

		// a handler runs with the fields of a module's scope; what is not a function stays as it is
		bus.fitScope = (scope, fn) => {
			if (typeof fn !== "function") {
				return fn;
			}

			return (payload: unknown, ctx: object) => {
				bus.applyScope?.(ctx, scope);
				return Reflect.apply(fn, null, [payload, ctx]);
			};
		};

		const emit = bus.emit as Emitter;
		const scoped: Emitter = (event, ...rest) => {
			const layers = layersFor(event, rest);
			// nothing to set and nothing to clear: a plain emit costs one call more
			if (!(layers || pendingLayers)) {
				return emit(event, ...rest);
			}

			const outerLayers = pendingLayers;
			const outerType = pendingType;
			const outerPayload = pendingPayload;
			pendingLayers = layers;
			pendingType = typeOf(event);
			pendingPayload = payloadOf(event, rest);
			try {
				return emit(event, ...rest);
			} finally {
				pendingLayers = outerLayers;
				pendingType = outerType;
				pendingPayload = outerPayload;
			}
		};
		bus.emit = scoped as Emit<E>;

		return bus;
	};
