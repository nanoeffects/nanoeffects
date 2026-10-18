import type { Bus, Command, Context } from "../core/bus";
import { createTask, forkTask } from "../core/context";
import type {
	EventMap,
	PayloadOf,
	Task,
	UnsubscribeCallback,
} from "../core/types";
import { onAbort } from "../utils";
import type { Binding, createCommands } from "./command";

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
	 * Mounts sub-modules; they are unmounted with this one. The returned function
	 * unmounts just these, e.g. when they were added later from a listener.
	 */
	use(...modules: Module<E>[]): UnsubscribeCallback;
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

/** What `registerModules` returns. */
export type ModuleApi<E extends EventMap = EventMap> = {
	/** Mounts a module and returns the function that unmounts it; a module that is mounted already is not run again. */
	mount(module: Module<E>): UnsubscribeCallback;
	unmount(module: Module<E>): void;
	isMounted(module: Module<E>): boolean;
	/** Unmounts every module; a disposed app cannot mount modules. */
	dispose(): void;
};

type Registry<E extends EventMap> = ReturnType<typeof createCommands<E>>;

/**
 * Assembles an app from modules on `bus`: mounts `modules` at once, in the
 * order given, and returns `mount`, `unmount`, `isMounted` and `dispose` for
 * the modules that come and go later. The bus needs the registry of
 * `createCommands` as its `commands` option, so that the commands the modules
 * bind are the ones it runs.
 *
 * Unmounting undoes everything the module did: its subscriptions, its bound
 * commands, its sub-modules and its background tasks. `dispose` unmounts them
 * all, and a disposed app cannot mount modules.
 *
 * @example
 * ```ts
 * const commands = createCommands<Events>();
 * const bus = createBus<Events>({ commands });
 * const app = registerModules(bus, [userModule]);
 *
 * const unmount = app.mount(orderModule); // later, e.g. after a lazy import
 * unmount(); // or app.unmount(orderModule)
 *
 * bus.emit(getUser, "1");
 * commands.handle(getUser, fakeUser); // in a test
 * app.dispose();
 * ```
 */
export const registerModules = <E extends EventMap>(
	bus: Bus<E>,
	modules: readonly Module<E>[] = [],
): ModuleApi<E> => {
	// the bus runs whatever it was given; to bind handlers it must be the registry
	const registry = bus.commands as Registry<E> | undefined;
	const commands = {
		handle: (...args: Parameters<Registry<E>["handle"]>) => {
			if (!registry?.handle) {
				throw new Error(
					"registerModules: create the bus with `commands: createCommands()`",
				);
			}
			return Reflect.apply(registry.handle, null, args);
		},
	};
	const root = createTask<E>({ type: "app", payload: void 0 }, bus, bus.trace);

	// Mounts modules under `parent`, each in a task of its own: aborting that
	// task undoes the module. A module that is mounted already is not run again.
	const mounts = (parent: Context<E>) => {
		const active = new Map<Module<E>, UnsubscribeCallback>();

		const mount = (module: Module<E>): UnsubscribeCallback => {
			const known = active.get(module);
			if (known) {
				return known;
			}

			const scope = forkTask(parent, module.name);
			const task = scope.ctx;
			const children = mounts(task);

			const unmount = () => {
				active.delete(module);
				task.abort();
				scope.unlink();
			};
			active.set(module, unmount);

			const handle = (target: unknown, fn?: unknown): UnsubscribeCallback => {
				const unbind: UnsubscribeCallback = Reflect.apply(
					commands.handle,
					null,
					[target, fn],
				);
				onAbort(task, unbind);
				return unbind;
			};
			const use = (...subs: Module<E>[]) => {
				const unmounts = subs.map(children.mount);
				return () => {
					for (const unmountSub of unmounts) {
						unmountSub();
					}
				};
			};
			const spawn = <P>(fn: Task<P, E, unknown>, ...payload: PayloadOf<P>) => {
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
		mount: (module) => {
			root.ctx.signal.throwIfAborted();
			return apps.mount(module);
		},
		unmount: apps.unmount,
		isMounted: apps.isMounted,
		dispose: () => root.ctx.abort(),
	};
};
