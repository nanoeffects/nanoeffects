import type { ModuleApi, WithApp } from "../actions/module";
import type { Bus } from "../core/bus";
import type { EventMap, UnsubscribeCallback } from "../core/types";

/** The parts of what `modulePlugin` returned that the diagnostics report. */
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
	/** Warn when a handler emits after its task was aborted, which means it ignored `ctx.signal`. Default `true`. */
	abandoned?: boolean;
	/** Receives every message. Default: `console.warn` for leaks and `console.info` for modules. */
	log?: (message: string) => void;
	/** What `modulePlugin` returned, to report its modules. Without it the app that `modulePlugin` put on the bus is used, in either order of the two plugins. */
	app?: ReportedApp<E>;
};

/** One signal that a handler lost: it kept working after its task was aborted. */
export type LostSignal = {
	/** `emit`: the handler emitted after the abort (the emit was dropped); `on`: it subscribed after the abort. */
	kind: "emit" | "on";
	/** The type of the task that was aborted: the event its handler works on. */
	handler: string;
	/** The event that was emitted or subscribed to. */
	event: string;
};

/** What `getLostSignalsCount` takes. */
export type LostSignalsOptions = {
	/** How long to wait, in ms, before counting, so handlers that are still running can finish. Default 0: one turn of the event loop. */
	wait?: number;
};

/** A plugin that connects the diagnostics to a bus; the function it returns disconnects them. */
export type DevPlugin = <E extends EventMap>(
	options?: DevOptions<E>,
) => (bus: Bus<E> & WithApp) => UnsubscribeCallback;
