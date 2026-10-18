# nanoeffects

## Errors in handlers

`emit` is a plain loop over the handlers, like in nanoevents: if a handler throws, the remaining handlers are skipped and the error reaches the caller of `emit`. A rejected promise of an async handler is left unhandled.

Pass `onError` to isolate handlers instead. Then every handler runs, and thrown errors and rejections of async handlers (including ones wrapped in `latest`, `debounce` and the like) go to `onError`; an `onError` that throws is logged to `console.error`.

```ts
const bus = createBus<Events>({
	onError: (error, { type, payload }) => report(error, type, payload),
});
```

## Tracing

Pass `trace` to `createBus` to observe every task phase. Make it with `createTracer` from `nanoeffects/trace`, which takes a logger (a function) or an array of them. The tracing code lives in that entry, so a bus without `trace` does not carry it.

```ts
import { createBus } from "nanoeffects";
import { createTracer } from "nanoeffects/trace";

const bus = createBus<Events>({
	trace: createTracer((event) => console.log(event)),
});
```

Each `TraceEvent` has:

| Field     | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| `id`      | Unique task id within the bus.                                       |
| `parent`  | Id of the task that started this one (absent for handler tasks).     |
| `type`    | Event type the task works on.                                        |
| `effect`  | `latest`, `debounce`, `throttle`, `leading`, `run`, `all` or `race`. |
| `phase`   | `start`, `done`, `error`, `cancel` or `drop`.                        |
| `payload` | Event payload.                                                       |
| `error`   | Thrown value, only for `error`.                                      |

Phases:

- `start`: the work began.
- `done` / `error`: it finished or threw.
- `cancel`: it was aborted after it started (superseded by `latest`, parent aborted, lost a `race`).
- `drop`: it never started (`leading` while busy, a `throttle` call replaced by a newer one, a `debounce` call replaced before its delay ended).

`all` and `race` are traced when you pass them the handler `ctx`: the group is one task, every starter is a child `run` task.

```ts
bus.on("load", async (id, ctx) => {
	await all({ user: () => fetchUser(id), posts: () => fetchPosts(id) }, ctx);
});
```

## Loggers

A logger is a function `(event: TraceEvent) => void` (the `TraceLogger` type). `createTracer` takes one logger or an array; a logger that throws is reported to `console.error` and never breaks the task or the other loggers.

```ts
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, reduxDevtools } from "nanoeffects/trace";

const bus = createBus<Events>({
	trace: createTracer([reduxDevtools({ name: "app" }), consoleLogger()]),
});
```

`nanoeffects/trace` ships `createTracer` and these loggers, each a factory that returns a `TraceLogger`:

| Logger                | What it does                                                                         |
| --------------------- | ------------------------------------------------------------------------------------ |
| `reduxDevtools()`     | Sends each phase to Redux DevTools as `type/effect/phase`; state is `{ running }`.   |
| `consoleLogger()`     | Prints one line per phase, indented by task depth.                                   |
| `performanceLogger()` | Records User Timing measures for the Timings track of the browser Performance panel. |
| `createTraceRecorder()`    | Keeps events in `recorder.events`, for tests.                                        |

Notes on `reduxDevtools`: it is read-only (the bus owns no state, so there is no time travel) and does nothing when the extension is not installed.

To write your own, return a `TraceLogger`:

```ts
import type { TraceLogger } from "nanoeffects";

const errorsOnly = (): TraceLogger => (event) => {
	if (event.phase === "error") report(event.error);
};
```

## Cancellation helpers

An abort only raises a flag: your code decides to stop. `nanoeffects/effects` has helpers for the usual cases.

`delay(ms, ctx)` waits and rejects on abort. `cancellable(executor, ctx)` is a promise tied to the task signal; it works like `new Promise`, but the executor gets one object, `{ resolve, reject, onCancel }`, with `onCancel` for cleanups:

```ts
import { cancellable } from "nanoeffects/effects";

bus.on(
	"wait",
	latest((_, ctx) =>
		cancellable<void>(({ resolve, onCancel }) => {
			const timer = setTimeout(resolve, 5000);
			onCancel(() => clearTimeout(timer));
		}, ctx),
	),
);
```

- If the task aborts before the promise settles, cleanups run (last registered first) and the promise rejects with the abort reason.
- If the task is already aborted, the executor does not run.
- After the promise settles, the abort listener is removed and cleanups are dropped.

`onAbort(fn, ctx)` runs `fn(reason)` on abort (at once if already aborted) and returns a function that unsubscribes:

```ts
import { onAbort } from "nanoeffects/effects";

bus.on("connect", (url, ctx) => {
	const socket = new WebSocket(url);
	onAbort(() => socket.close(), ctx);
});
```

In every effect `ctx` is the last argument, as in a handler `(payload, ctx)`: `delay(ms, ctx)`, `all(effects, ctx)`, `race(effects, ctx)`, `cancellable(executor, ctx)`, `onAbort(fn, ctx)`.

For `fetch` and other APIs that take a signal, pass `ctx.signal`. A timeout without `race`: `AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])`.

