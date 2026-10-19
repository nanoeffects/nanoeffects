import type { ModuleApi } from "../actions/module";
import type { Bus } from "../core/bus";
import type { EventMap, UnsubscribeCallback } from "../core/types";

/** The parts of what `registerModules` returned that the diagnostics report. */
export type ReportedApp<E extends EventMap> = Pick<
	ModuleApi<E>,
	"mount" | "unmount" | "isMounted"
>;

export type DevOptions<E extends EventMap = EventMap> = {
	/** Warn when more listeners than this are added to one event and not unsubscribed. Default 10. */
	maxListeners?: number;
	/** Check the number of listeners. Default `true`. */
	leaks?: boolean;
	/** Report the modules of `app` that are mounted, replaced and unmounted. Default `true`. */
	modules?: boolean;
	/** Receives every message. Default: `console.warn` for leaks and `console.info` for modules. */
	log?: (message: string) => void;
	/** What `registerModules` returned, to report its modules. */
	app?: ReportedApp<E>;
};

/** Connects the diagnostics to a bus; the returned function disconnects them. */
export type ConnectDev = <E extends EventMap>(
	bus: Bus<E>,
	options?: DevOptions<E>,
) => UnsubscribeCallback;
