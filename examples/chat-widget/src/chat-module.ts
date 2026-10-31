import type { Context, EventMap } from "nanoeffects";
import { createModule } from "nanoeffects/actions";
import { queue } from "nanoeffects/policies";
import { closeRequested, messageSent } from "./chat";
import { askBot, watchOperator } from "./chat-handlers";

// The task stays pending until the module unmounts: a finished task is not aborted again.
const untilAborted = (ctx: Context<EventMap>) =>
	new Promise((resolve) => {
		ctx.signal.addEventListener("abort", resolve, { once: true });
	});

// A DOM listener that lives as long as the module. `addEventListener` takes a `signal` and
// removes the listener when it aborts.
const listenToEscape = async (_: unknown, ctx: Context<EventMap>) => {
	const onKey = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			ctx.emit(closeRequested());
		}
	};
	document.addEventListener("keydown", onKey, { signal: ctx.signal });
	await untilAborted(ctx);
};

// everything that is alive while the chat is open; unmounting undoes every line of it
export const chatModule = createModule("chat", (module) => {
	// A handler of `on` runs as a child of whoever emitted, so closing the chat would not abort
	// it. `module.run` runs askBot as a child of the module instead: unmounting aborts it.
	const answer = (text: string) => module.run(askBot, text);
	// on + queue — answer the texts one after another, in the order they were sent
	module.on(messageSent, queue(answer));
	// spawn — a background task that lives as long as the module
	module.spawn(watchOperator);
	module.spawn(listenToEscape);
});
