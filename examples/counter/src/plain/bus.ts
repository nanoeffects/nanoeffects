import { createBus } from "nanoeffects";

// createBus — the event bus. It needs no plugin.
// onError — an error that no handler caught goes here, and the other handlers still run
export const bus = createBus({
	onError: (error, { type }) =>
		console.error(`A handler of "${type}" failed`, error),
});
