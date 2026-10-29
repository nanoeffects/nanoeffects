import type { Bus, Command, Context, Emit } from "../core/bus";
import { createTask, forkTask } from "../core/context";
import type { Scope } from "../core/scope-types";
import type {
	EventMap,
	PayloadOf,
	Task,
	UnsubscribeCallback,
} from "../core/types";
import type { Scoped, ScopeSlots } from "../scope/types";
import { onAbort, report } from "../utils";
import { type Binding, commandsPlugin } from "./command";
import { holdListeners } from "./hold";
import { mountEach } from "./mount-each";

/**
 * What a module's `setup` gets: the context of the module's task, so `on`,
 * `emit` and `run` work as in a handler, plus `handle` to bind commands, `use`
 * to mount sub-modules and `spawn` to start a background task. Everything the
 * module does is undone when it is unmounted.
 */
export type ModuleContext<E extends EventMap = EventMap> = Context<E> & {
	/** Binds the handler of a command, or a list of them; undone on unmount. */
	handle<P, R>(command: Command<P, R>, fn: Task<P, E, R>): UnsubscribeCallback;
	handle(type: string, fn: Task<never, E, unknown>): UnsubscribeCallback;
	handle(bindings: readonly Binding<E>[]): UnsubscribeCallback;
	/**
	 * Brings sub-modules and commands, in any order. A sub-module is mounted and
	 * unmounted with this one. A command is bound to the handler it carries, for
	 * as long as this module is mounted; a command that answers by itself keeps
	 * answering after the module is gone, since the handler is its own. The
	 * returned function undoes just this call, e.g. for what was added later from
	 * a listener.
	 */
	use(
		...items: Array<
			Module<E> | { readonly type: string; (payload: never): unknown }
		>
	): UnsubscribeCallback;
	/**
	 * Starts a background task that lives as long as the module: it is aborted
	 * on unmount, and an error of it is left unhandled, as in any handler.
	 */
	spawn<P>(fn: Task<P, E, unknown>, ...payload: PayloadOf<P>): void;
};

export type Module<E extends EventMap = EventMap> = {
	readonly name: string;
	readonly setup: (m: ModuleContext<E>) => void;
	/** Fields for everything the module owns; see `scopePlugin`. */
	readonly scope?: Scope;
};

/**
 * Describes one domain of an app: the commands it handles, the events it
 * listens to, its sub-modules and its background tasks. The `name` shows up as
 * the type of the module's tasks in the trace.
 *
 * @example
 * ```ts
 * export const userModule = createModule<Events>("user", (m) => {
 *   m.handle(getUser, fetchUser);
 *   m.handle([bindHandler(sendMail, smtpSend)]);
 *   m.use(authModule);
 *
 *   m.on(loginRequested, (user, ctx) => ctx.emit(userLoaded(user)));
 *   m.spawn(async (_, ctx) => {
 *     for (;;) await handleNext(await take(ctx, "job"));
 *   });
 * });
 * ```
 */
export function createModule<E extends EventMap = EventMap>(
	name: string,
	setup: (m: ModuleContext<E>) => void,
): Module<E>;
export function createModule<
	E extends EventMap,
	S extends Scope = Record<never, never>,
>(
	name: string,
	setup: (m: ModuleContext<Scoped<E, S>>) => void,
	scope: S,
): Module<E>;
export function createModule(
	name: string,
	setup: (m: ModuleContext<EventMap>) => void,
	scope?: Scope,
): Module {
	return scope ? { name, setup, scope } : { name, setup };
}

// wraps a handler of a module with a scope, so it runs with the fields of that scope; the plugin does the wrapping
const fitter =
	<E extends EventMap>(bus: Bus<E> & ScopeSlots, own: Scope | undefined) =>
	(fn: unknown): unknown =>
		own ? (bus.fitScope?.(own, fn) ?? fn) : fn;

// gives the task of a module the fields of its scope, if it has one
const scopeTask = <E extends EventMap>(
	bus: Bus<E> & ScopeSlots,
	task: Context<E>,
	own: Scope | undefined,
) => {
	if (own) {
		bus.applyScope?.(task, own);
	}
};

// the arguments of `commands.handle` with the handlers of a module wrapped
const fitted = (
	within: (fn: unknown) => unknown,
	target: unknown,
	fn: unknown,
) => {
	if (Array.isArray(target)) {
		return [target.map(([command, handler]) => [command, within(handler)]), fn];
	}
	return [target, within(fn)];
};

// the `on` of a module: its listeners run with the fields of the module's scope
const listenWith = <E extends EventMap>(
	task: Context<E>,
	within: (fn: unknown) => unknown,
) => {
	const taskOn = task.on;

	return (...args: unknown[]) => {
		// the options (`{ traceId }` of `tracePlugin`) go on to `on`
		const [event, fn, ...rest] = args;
		return Reflect.apply(taskOn, null, [event, within(fn), ...rest]);
	};
};

// starts a background task of the module: aborted on unmount, an error of it left unhandled
const spawnOn =
	<E extends EventMap>(task: Context<E>) =>
	<P>(fn: Task<P, E, unknown>, ...payload: PayloadOf<P>) => {
		task.run(fn, ...payload).catch((error: unknown) => {
			if (!task.signal.aborted) {
				throw error;
			}
		});
	};

type Registry<E extends EventMap> = ReturnType<
	ReturnType<typeof commandsPlugin<E>>
>;

/**
 * The modules of an app as the plugins that report on them see them: the part
 * of what `modulePlugin` returns that `devPlugin` wraps.
 */
export interface ModuleHost {
	mount(...modules: Array<{ readonly name: string }>): UnsubscribeCallback;
	unmount(...modules: Array<{ readonly name: string }>): void;
	isMounted(module: { readonly name: string }): boolean;
}

/** The slot `modulePlugin` fills; a bus has it in its type once the plugin returned it. */
export interface WithApp {
	app?: ModuleHost | undefined;
}

/** What `modulePlugin` returns. */
export type ModuleApi<E extends EventMap = EventMap> = {
	/** The registry of command handlers of the bus: the one it was made with, or the app's own. */
	commands: Registry<E>;
	/**
	 * Mounts modules, in the order given, and returns the function that unmounts them, last
	 * mounted first. A module that is mounted already is not run again. If one of them throws,
	 * the ones mounted by this call are unmounted and the error is thrown.
	 */
	mount(...modules: Module<E>[]): UnsubscribeCallback;
	/** Unmounts modules, in reverse order of the arguments. */
	unmount(...modules: Module<E>[]): void;
	isMounted(module: Module<E>): boolean;
	/** Unmounts every module; a disposed app cannot mount modules. */
	dispose(): void;
	/**
	 * `createModule` with the event map of this bus: the module sees the context
	 * fields of the bus without a type argument. It returns a plain module, not
	 * mounted, with no link to this bus.
	 */
	createModule(name: string, setup: (m: ModuleContext<E>) => void): Module<E>;
	createModule<S extends Scope = Record<never, never>>(
		name: string,
		setup: (m: ModuleContext<Scoped<E, S>>) => void,
		scope: S,
	): Module<E>;
};

/**
 * The plugin that assembles an app from modules: `bus.use(modulePlugin(modules))`
 * returns `mount`, `unmount`, `isMounted`, `dispose` and `commands` for the
 * modules that come and go, and mounts `modules`, in the order given, on the
 * first use of the app or of the bus: the first `bus.emit`, or the first call
 * of one of its methods. By then every plugin is on the bus, so the plugins can
 * be used in any order. The `on`, `once` and `off` calls made in between are
 * held and made right after the modules, so the listeners of a module stay
 * ahead of them. The bus runs the commands that the modules bind: the registry
 * that the bus has is used (a later `commandsPlugin` binds in it), otherwise the
 * app attaches its own, as `app.commands`. The app is also `bus.app`.
 *
 * A module is known by its `name`: mounting a module whose name is taken
 * replaces the mounted one, which is unmounted first. That is what hot reload
 * needs (see `docs/hmr.md`): the new version of a module file mounts again and
 * the old version goes away with its subscriptions, commands and tasks.
 *
 * Unmounting undoes everything the module did: its subscriptions, its bound
 * commands, its sub-modules and its background tasks. `dispose` unmounts them
 * all, and a disposed app cannot mount modules.
 *
 * @example
 * ```ts
 * const bus = createBus<Events>();
 * const app = bus.use(modulePlugin([userModule]));
 *
 * const unmount = app.mount(orderModule); // later, e.g. after a lazy import
 * unmount(); // or app.unmount(orderModule)
 *
 * // a module made from the app has the context fields of the bus, typed
 * const userModule = app.createModule("user", (m) => {
 *   m.on("loaded", (user, { store }) => store.put(user));
 * });
 *
 * bus.emit(getUser, "1");
 * app.commands.handle(getUser, fakeUser); // in a test
 * app.dispose();
 * ```
 */
export const modulePlugin =
	<E extends EventMap>(modules: readonly Module<E>[] = []) =>
	(bus: Bus<E> & ScopeSlots & WithApp): ModuleApi<E> => {
		// the bus runs what it was given; without commands the app attaches its registry
		const given = bus.commands as Registry<E> | undefined;
		const registry = given ?? commandsPlugin<E>()(bus);
		const commands = {
			handle: (...args: Parameters<Registry<E>["handle"]>) => {
				if (!registry.handle) {
					throw new Error(
						"modulePlugin: the `commands` of the bus is not a registry from `commandsPlugin()`",
					);
				}
				return Reflect.apply(registry.handle, null, args);
			},
		};
		// Mounts modules under `parent`, each in a task of its own: aborting that
		// task undoes the module. A module that is mounted already is not run again.
		const mounts = (parent: Context<E>) => {
			const active = new Map<Module<E>, UnsubscribeCallback>();
			const byName = new Map<string, Module<E>>();

			const mount = (module: Module<E>): UnsubscribeCallback => {
				const known = active.get(module);
				if (known) {
					return known;
				}
				// a module of the same name is replaced: this is how hot reload swaps a module
				const replaced = byName.get(module.name);
				if (replaced) {
					active.get(replaced)?.();
				}

				const scope = forkTask(parent, module.name);
				const task = scope.ctx;
				const children = mounts(task);

				const unmount = () => {
					active.delete(module);
					if (byName.get(module.name) === module) {
						byName.delete(module.name);
					}
					task.abort();
					scope.unlink();
				};
				active.set(module, unmount);
				byName.set(module.name, module);

				// what the module owns gets its scope fields: the plugin wraps the handler
				const own = module.scope;
				const within = fitter(bus, own);
				const handle = (target: unknown, fn?: unknown): UnsubscribeCallback => {
					const unbind: UnsubscribeCallback = Reflect.apply(
						commands.handle,
						null,
						fitted(within, target, fn),
					);
					onAbort(task, unbind);
					return unbind;
				};
				const use = (
					...items: Array<
						Module<E> | { readonly type: string; (payload: never): unknown }
					>
				) => {
					// a command (a function) is bound to itself: its own handler answers
					const undos = items.map((item) =>
						typeof item === "function"
							? handle(item, item)
							: children.mount(item),
					);
					return () => {
						for (const undo of undos) {
							undo();
						}
					};
				};
				const spawn = spawnOn<E>(task);
				// the on of the module: its listeners get the fields of the scope as well
				const on = listenWith(task, within);

				try {
					scopeTask(bus, task, own);
					module.setup(Object.assign(task, { handle, use, spawn, on }));
				} catch (error) {
					unmount();
					throw error;
				}

				return unmount;
			};

			return {
				mount,
				unmount: (module: Module<E>) => active.get(module)?.(),
				isMounted: (module: Module<E>) => active.has(module),
			};
		};

		// Nothing is made until the app is first used, so every plugin used after this one
		// is on the bus by then and its fields reach the modules. The `on`, `once` and `off`
		// that come in between wait, and are made after the modules, so the listeners of
		// the modules keep their place ahead of them.
		const hold = holdListeners(bus);
		const emitted = bus.emit;
		type Running = {
			root: ReturnType<typeof createTask<E>>;
			apps: ReturnType<typeof mountEach<Module<E>>>;
		};
		let running: Running | undefined;

		const start = (initial = true): Running => {
			if (running) {
				return running;
			}
			hold.release();
			if (bus.emit === starting) {
				bus.emit = emitted;
			}
			const root = createTask<E>({
				event: { type: "app", payload: void 0 },
				bus,
				tracer: bus.trace,
			});
			// set before the modules are mounted: a `setup` that uses the app does not start it again
			running = { root, apps: mountEach(mounts(root.ctx)) };
			try {
				if (initial) {
					running.apps.mount(...modules);
				}
			} finally {
				// the listeners that came after `bus.use` are made even when a `setup` throws
				hold.replay();
			}

			return running;
		};

		// the first emit is a use of the bus: a module must be a listener before its event is delivered
		const starting = (...args: unknown[]) => {
			start();
			return Reflect.apply(emitted, bus, args);
		};
		bus.emit = starting as Emit<E>;

		// Nothing used the app by the end of this synchronous block: start it now. Every
		// `bus.use` of the same block has run by then, so the plugins used after this one
		// still reach the modules. If the app was used or disposed before, `start` does nothing.
		if (modules.length > 0) {
			queueMicrotask(() => {
				try {
					start();
				} catch (error) {
					// there is no caller to throw to; the modules of the list are rolled back
					report("the modules of the app could not start", error);
				}
			});
		}

		const app: ModuleApi<E> = {
			get commands() {
				start();
				return registry;
			},
			mount: (...given) => {
				const { root, apps } = start();
				root.ctx.signal.throwIfAborted();
				return apps.mount(...given);
			},
			unmount: (...given) => start().apps.unmount(...given),
			isMounted: (module) => start().apps.isMounted(module),
			// a dispose that comes first starts the app without the initial modules
			dispose: () => start(false).root.ctx.abort(),
			createModule,
		};
		bus.app = app;

		return app;
	};
