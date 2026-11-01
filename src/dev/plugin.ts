import type { ModuleHost, WithApp } from "../actions/module";
import { mountEach } from "../actions/mount-each";
import type { Bus } from "../core/bus";
import { emitAfterAbort } from "../core/emit-key";
import { eventKey } from "../core/event";
import { recordSite } from "../core/site";
import type { EventMap } from "../core/types";
import type { DevPlugin } from "./types";

const PREFIX = "[nanoeffects]";

/**
 * A plugin with development diagnostics for a bus, used while the app is built
 * and while its files are reloaded:
 *
 * - **Listeners that pile up.** When more than `maxListeners` listeners are
 *   added to one event and not unsubscribed, one warning names the event and
 *   the count: a file that was reloaded and subscribes again, or an
 *   unsubscribe that is never called. The count follows the function that `on`
 *   returns; `bus.off(event, fn)` is not seen.
 * - **Handlers that ignore the signal.** When a handler emits after its task was aborted (a newer
 *   call of `latest`, an unmounted module), the emit is dropped, and one warning names the handler
 *   and the event: the handler did not stop when it was cancelled, usually because `ctx.signal` was
 *   never given to the request. Nothing is added to the policies; the check is this plugin's.
 * - **Modules.** It reports a module that is mounted, replaced by name and
 *   unmounted, for the app that `modulePlugin` returned: the `app` option, or
 *   else the one `modulePlugin` put on the bus, whichever plugin was used first.
 *
 * It wraps `bus.on`, `app.mount` and `app.unmount`; the function that `bus.use` returns
 * puts the originals back. In a production build `nanoeffects/dev` is a no-op, so
 * the call can stay as it is.
 *
 * @example
 * ```ts
 * bus.use(modulePlugin([userModule]));
 * const disconnect = bus.use(devPlugin()); // warnings and messages in the console while developing
 * ```
 */
export const devPlugin: DevPlugin =
	(options = {}) =>
	(bus) => {
		const {
			maxListeners = 10,
			leaks = true,
			modules = true,
			abandoned = true,
			app,
		} = options;
		const warn = options.log ?? ((message: string) => console.warn(message));
		const info = options.log ?? ((message: string) => console.info(message));
		const restores: Array<() => void> = [];

		if (leaks) {
			restores.push(watchListeners(bus, maxListeners, warn));
		}
		if (modules) {
			restores.push(watchApp(bus, app, info));
		}
		if (abandoned) {
			restores.push(watchAbandoned(bus, warn));
		}

		return () => {
			for (const restore of restores.splice(0)) {
				restore();
			}
		};
	};

// The event a listener is counted under. A predicate (`matchPlugin`) is a function with no
// string `type`; it listens to every event, as `"*"` does, and that is where it is counted.
const keyOf = (event: string | { type: string }) =>
	typeof event === "function" && typeof Reflect.get(event, "type") !== "string"
		? "*"
		: eventKey(event);

// the frame of the code that called `on`, kept for a listener that has a name; it is the fifth line of the stack: Error, callSite, siteOfListener, the wrapper of `on`, then the caller
const callSite = () => {
	const lines = new Error().stack?.split("\n") ?? [];
	const frame = lines[4] ?? "";

	return frame.trim().replace(/^at /, "");
};

// notes where a named listener was made, and returns the function that drops the note
const siteOfListener = (args: unknown[]) => {
	const options: unknown = args[2];
	const name: unknown =
		typeof options === "object" && options !== null
			? Reflect.get(options, "traceId")
			: void 0;
	const site = typeof name === "string" ? callSite() : "";

	return typeof name === "string" && site !== ""
		? recordSite(name, site)
		: () => {};
};

// counts the listeners that were added and not unsubscribed, per event
const watchListeners = <E extends EventMap>(
	bus: Bus<E>,
	max: number,
	warn: (message: string) => void,
) => {
	const original = bus.on;
	const counts = new Map<string, number>();
	const warned = new Set<string>();

	let active = true;
	const wrapped = (...args: unknown[]) => {
		if (!active) {
			return Reflect.apply(original, bus, args);
		}
		const [event] = args as [string | { type: string }];
		const key = keyOf(event);
		const count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		if (count > max && !warned.has(key)) {
			warned.add(key);
			warn(
				`${PREFIX} ${count} listeners of "${key}" were added and not unsubscribed (more than ${max}). ` +
					"A file that is reloaded and subscribes again, or an unsubscribe that is never called?",
			);
		}

		const off: () => void = Reflect.apply(original, bus, args);
		const forgetSite = siteOfListener(args);
		let removed = false;

		return () => {
			if (!removed) {
				removed = true;
				forgetSite();
				const left = (counts.get(key) ?? 1) - 1;
				counts.set(key, left);
				if (left <= max) {
					warned.delete(key);
				}
			}
			off();
		};
	};
	bus.on = wrapped as typeof bus.on;

	return () => {
		active = false;
		// a wrapper that another plugin put on top since stays, and passes every call through
		if (bus.on === wrapped) {
			bus.on = original;
		}
	};
};

type Emitter = (event: unknown, ...rest: unknown[]) => unknown;

// an event is a string, or an object, a creator or an action that has a `type`
const nameOf = (event: unknown) =>
	typeof event === "string"
		? event
		: String(Reflect.get(Object(event), "type"));

type Aborted = {
	type: string;
	signal: AbortSignal;
	emit: Emitter;
	on: Emitter;
};

// Watches `ctx.emit` of every task. An emit after the signal of the task aborted is dropped by the bus,
// so a handler that does it kept working after it was cancelled: it did not use `ctx.signal`.
const watchAbandoned = <E extends EventMap>(
	bus: Bus<E>,
	warn: (message: string) => void,
) => {
	const previous = bus.addContext;
	const told = new Set<string>();
	let active = true;

	const wrapped = (target: object) => {
		previous?.(target);
		const task = target as Aborted;
		const emitOf = task.emit;
		task.emit = (event, ...rest) => {
			// `createJob` opens this gate for its own emit of `cancel`: that one is meant to pass
			const gate = Reflect.get(target, emitAfterAbort);
			const name = nameOf(event);
			const key = `${task.type}\u0000${name}`;
			if (active && task.signal.aborted && gate !== true && !told.has(key)) {
				told.add(key);
				warn(
					`${PREFIX} the handler of "${task.type}" emitted "${name}" after its task was aborted, so the emit was dropped. ` +
						"The handler kept running after it was cancelled: pass ctx.signal to the request (fetch(url, { signal: ctx.signal })) " +
						"or give ctx to an effect (retry(ctx, ...)).",
				);
			}

			return emitOf(event, ...rest);
		};
		// `ctx.on` after an abort adds nothing and returns a function that does nothing: the same mistake
		const onOf = task.on;
		task.on = (event, ...rest) => {
			const name = nameOf(event);
			const key = `${task.type}\u0000on\u0000${name}`;
			if (active && task.signal.aborted && !told.has(key)) {
				told.add(key);
				warn(
					`${PREFIX} the handler of "${task.type}" subscribed to "${name}" after its task was aborted, so the subscription was dropped. ` +
						"The handler kept running after it was cancelled: pass ctx.signal to the request or give ctx to an effect.",
				);
			}

			return onOf(event, ...rest);
		};
	};

	bus.addContext = wrapped;

	return () => {
		active = false;
		// a wrapper that another plugin put on top since stays, and passes every call through
		if (bus.addContext === wrapped) {
			bus.addContext = previous;
		}
	};
};

type Named = { readonly name: string };

// Watches the app that is given, else the one on the bus; when there is none yet, the one
// `modulePlugin` puts there later. Returns the function that stops watching.
const watchApp = <E extends EventMap>(
	bus: Bus<E> & WithApp,
	given: ModuleHost | undefined,
	info: (message: string) => void,
) => {
	const known = given ?? bus.app;
	if (known) {
		return watchModules(known, info);
	}

	let held: ModuleHost | undefined;
	let stop: (() => void) | undefined;
	Object.defineProperty(bus, "app", {
		configurable: true,
		enumerable: true,
		get: () => held,
		set: (value: ModuleHost | undefined) => {
			stop?.();
			held = value;
			stop = value ? watchModules(value, info) : void 0;
		},
	});

	return () => {
		stop?.();
		// the plain field again, with the app it was given
		Object.defineProperty(bus, "app", {
			configurable: true,
			enumerable: true,
			writable: true,
			value: held,
		});
	};
};

// reports what happens to the modules that go through `app.mount` and `app.unmount`
const watchModules = (app: ModuleHost, info: (message: string) => void) => {
	const { mount, unmount } = app;
	const mounted = new Map<string, Named>();

	const mountReported = (module: Named) => {
		const held = mounted.get(module.name);
		if (held === module && app.isMounted(module)) {
			return mount(module);
		}

		const replaced = held !== void 0 && app.isMounted(held);
		const undo = mount(module);
		mounted.set(module.name, module);
		info(
			`${PREFIX} module "${module.name}" ${replaced ? "replaced" : "mounted"}`,
		);

		return () => {
			if (app.isMounted(module)) {
				info(`${PREFIX} module "${module.name}" unmounted`);
			}
			undo();
		};
	};
	const unmountReported = (module: Named) => {
		if (app.isMounted(module)) {
			info(`${PREFIX} module "${module.name}" unmounted`);
		}
		unmount(module);
	};
	// the same form as the app has: any number of modules, each one reported as it goes through
	const reported = mountEach({
		mount: mountReported,
		unmount: unmountReported,
		isMounted: (module: Named) => app.isMounted(module),
	});
	app.mount = reported.mount;
	app.unmount = reported.unmount;

	return () => {
		app.mount = mount;
		app.unmount = unmount;
	};
};
