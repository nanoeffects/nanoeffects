import type { Bus, Command, Context } from "../core/bus";
import { createTask, forkTask } from "../core/context";
import type {
	EventMap,
	PayloadOf,
	Task,
	UnsubscribeCallback,
} from "../core/types";
import { onAbort } from "../utils";
import { type Binding, commandsPlugin } from "./command";

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
export const createModule = <E extends EventMap = EventMap>(
	name: string,
	setup: (m: ModuleContext<E>) => void,
): Module<E> => ({ name, setup });

type Registry<E extends EventMap> = ReturnType<
	ReturnType<typeof commandsPlugin<E>>
>;

/** What `modulePlugin` returns. */
export type ModuleApi<E extends EventMap = EventMap> = {
	/** The registry of command handlers of the bus: the one it was made with, or the app's own. */
	commands: Registry<E>;
	/** Mounts a module and returns the function that unmounts it; a module that is mounted already is not run again. */
	mount(module: Module<E>): UnsubscribeCallback;
	unmount(module: Module<E>): void;
	isMounted(module: Module<E>): boolean;
	/** Unmounts every module; a disposed app cannot mount modules. */
	dispose(): void;
	/**
	 * `createModule` with the event map of this bus: the module sees the context
	 * fields of the bus without a type argument. It returns a plain module, not
	 * mounted, with no link to this bus.
	 */
	createModule(name: string, setup: (m: ModuleContext<E>) => void): Module<E>;
};

/**
 * The plugin that assembles an app from modules: `bus.use(modulePlugin(modules))`
 * mounts `modules` at once, in the order given, and returns `mount`, `unmount`,
 * `isMounted`, `dispose` and `commands` for the modules that come and go later. The bus runs the commands that the
 * modules bind: if `bus.use(commandsPlugin())` was called before, that registry is
 * used, otherwise the app attaches its own, as `app.commands`.
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
	(bus: Bus<E>): ModuleApi<E> => {
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
		const root = createTask<E>({
			event: { type: "app", payload: void 0 },
			bus,
			tracer: bus.trace,
		});

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

				const handle = (target: unknown, fn?: unknown): UnsubscribeCallback => {
					const unbind: UnsubscribeCallback = Reflect.apply(
						commands.handle,
						null,
						[target, fn],
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
				const spawn = <P>(
					fn: Task<P, E, unknown>,
					...payload: PayloadOf<P>
				) => {
					task.run(fn, ...payload).catch((error: unknown) => {
						if (!task.signal.aborted) {
							throw error;
						}
					});
				};

				try {
					module.setup(Object.assign(task, { handle, use, spawn }));
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

		const apps = mounts(root.ctx);
		for (const module of modules) {
			apps.mount(module);
		}

		return {
			commands: registry,
			mount: (module) => {
				root.ctx.signal.throwIfAborted();
				return apps.mount(module);
			},
			unmount: apps.unmount,
			isMounted: apps.isMounted,
			dispose: () => root.ctx.abort(),
			createModule,
		};
	};
