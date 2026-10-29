import type { UnsubscribeCallback } from "../core/types";

/** What `mountEach` needs: the calls of the app for one module. */
export type MountOne<M> = {
	mount: (module: M) => UnsubscribeCallback;
	unmount: (module: M) => void;
	isMounted: (module: M) => boolean;
};

/**
 * Gives `mount` and `unmount` of an app the form that takes any number of modules, from the
 * calls that take one. Several modules are mounted left to right and undone in reverse order,
 * so what started last stops first. A module that is mounted already is skipped, and the
 * function that `mount` returns undoes only the modules that this call mounted. If one
 * module throws while it is mounted, the ones of this call that were mounted are undone and
 * the error is thrown. One module is mounted by the call that takes one, as it always was.
 */
export const mountEach = <M>(one: MountOne<M>) => {
	const mount = (...modules: M[]): UnsubscribeCallback => {
		const [only] = modules;
		if (modules.length === 1 && only !== void 0) {
			return one.mount(only);
		}

		const started: UnsubscribeCallback[] = [];
		const undo = () => {
			for (const stop of started.splice(0).reverse()) {
				stop();
			}
		};

		try {
			for (const module of modules) {
				if (!one.isMounted(module)) {
					started.push(one.mount(module));
				}
			}
		} catch (error) {
			undo();
			throw error;
		}

		return undo;
	};

	const unmount = (...modules: M[]) => {
		for (const module of [...modules].reverse()) {
			one.unmount(module);
		}
	};

	return { mount, unmount, isMounted: one.isMounted };
};
