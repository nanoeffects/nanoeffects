// A page for the browser tests of the trace: one bus with every logger and, unless the address
// says `?plugin=off`, tracePlugin. `runFlow()` runs a checkout and answers with what it returned.
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";
import {
	consoleLogger,
	createTracer,
	performanceLogger,
	reduxDevtools,
	tracePlugin,
} from "nanoeffects/trace";

const loggers = [
	consoleLogger(),
	performanceLogger(),
	reduxDevtools({
		name: "fixture",
		policies: true,
		depth: Number.POSITIVE_INFINITY,
	}),
];
type Events = { "cart/changed": number };

const bus = createBus<Events>({ trace: createTracer(loggers) });

if (new URLSearchParams(location.search).get("plugin") !== "off") {
	bus.use(tracePlugin());
}

// the first attempt is declined, the second goes through; the group names the whole flow
const pay = createCommand(
	"checkout/pay",
	(total: number, ctx) =>
		retry(
			ctx,
			(attempt) => {
				if (attempt < 2) {
					throw new Error("declined");
				}
				return `paid ${total}`;
			},
			{ times: 3 },
		),
	{ traceGroupId: "checkout" },
);

let finish = (_result: string) => {};

// a named listener: its task is called saveCart in the trace
bus.on(
	"cart/changed",
	latest(async (total, ctx) => {
		finish(String(await ctx.emit(pay(total))));
	}),
	{ traceId: "saveCart" },
);

Reflect.set(
	window,
	"runFlow",
	() =>
		new Promise<string>((resolve) => {
			finish = resolve;
			bus.emit("cart/changed", 5);
		}),
);
