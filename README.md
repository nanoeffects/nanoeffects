# nanoeffects

## Tracing

Pass a `trace` hook to `createBus` to observe every task phase. Without the hook tracing costs nothing.

```ts
import { createBus } from "nanoeffects";

const bus = createBus<Events>({
	trace: (event) => console.log(event),
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

A logger is a function `(event: TraceEvent) => void` (the `TraceLogger` type). `trace` takes one logger or an array; a logger that throws is reported to `console.error` and never breaks the task or the other loggers.

```ts
import { createBus } from "nanoeffects";
import { consoleLogger, reduxDevtools } from "nanoeffects/trace";

const bus = createBus<Events>({
	trace: [reduxDevtools({ name: "app" }), consoleLogger()],
});
```

`nanoeffects/trace` ships these loggers, each a factory that returns a `TraceLogger`:

| Logger                | What it does                                                                         |
| --------------------- | ------------------------------------------------------------------------------------ |
| `reduxDevtools()`     | Sends each phase to Redux DevTools as `type/effect/phase`; state is `{ running }`.   |
| `consoleLogger()`     | Prints one line per phase, indented by task depth.                                   |
| `performanceLogger()` | Records User Timing measures for the Timings track of the browser Performance panel. |
| `createRecorder()`    | Keeps events in `recorder.events`, for tests.                                        |

Notes on `reduxDevtools`: it is read-only (the bus owns no state, so there is no time travel) and does nothing when the extension is not installed.

To write your own, return a `TraceLogger`:

```ts
import type { TraceLogger } from "nanoeffects";

const errorsOnly = (): TraceLogger => (event) => {
	if (event.phase === "error") report(event.error);
};
```
