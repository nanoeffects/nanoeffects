import type { Module } from "../actions/module";
import type { Bus } from "../core/bus";
import { eventKey } from "../core/event";
import type { EventMap } from "../core/types";
import type { DevPlugin, ReportedApp } from "./types";

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
 * - **Modules.** With `app` (what `modulePlugin` returned) it reports a
 *   module that is mounted, replaced by name and unmounted.
 *
 * It wraps `bus.on`, `app.mount` and `app.unmount`; the function that `bus.use` returns
 * puts the originals back. In a production build `nanoeffects/dev` is a no-op, so
 * the call can stay as it is.
 *
 * @example
 * ```ts
 * const app = bus.use(modulePlugin([userModule]));
 * const disconnect = bus.use(devPlugin({ app })); // warnings and messages in the console while developing
 * ```
 */
export const devPlugin: DevPlugin =
	(options = {}) =>
	(bus) => {
		const { maxListeners = 10, leaks = true, modules = true, app } = options;
		const warn = options.log ?? ((message: string) => console.warn(message));
		const info = options.log ?? ((message: string) => console.info(message));
		const restores: Array<() => void> = [];

		if (leaks) {
			restores.push(watchListeners(bus, maxListeners, warn));
		}
		if (modules && app) {
			restores.push(watchModules(app, info));
		}

		return () => {
			for (const restore of restores.splice(0)) {
				restore();
			}
		};
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

	const wrapped = (...args: unknown[]) => {
		const [event] = args as [string | { type: string }];
		const key = eventKey(event);
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
		let removed = false;

		return () => {
			if (!removed) {
				removed = true;
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
		bus.on = original;
	};
};

// reports what happens to the modules that go through `app.mount` and `app.unmount`
const watchModules = <E extends EventMap>(
	app: ReportedApp<E>,
	info: (message: string) => void,
) => {
	const { mount, unmount } = app;
	const mounted = new Map<string, Module<E>>();

	const mountReported = (module: Module<E>) => {
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
	const unmountReported = (module: Module<E>) => {
		if (app.isMounted(module)) {
			info(`${PREFIX} module "${module.name}" unmounted`);
		}
		unmount(module);
	};
	app.mount = mountReported as typeof app.mount;
	app.unmount = unmountReported as typeof app.unmount;

	return () => {
		app.mount = mount;
		app.unmount = unmount;
	};
};
