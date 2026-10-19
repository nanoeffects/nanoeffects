# Tracing

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
  await all(ctx, { user: () => fetchUser(id), posts: () => fetchPosts(id) });
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

| Logger                  | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `reduxDevtools()`       | Sends tasks to Redux DevTools as `type/effect/phase`; state is `{ running }`.        |
| `consoleLogger()`       | Prints one line per phase, indented by task depth.                                   |
| `performanceLogger()`   | Records User Timing measures for the Timings track of the browser Performance panel. |
| `createTraceRecorder()` | Keeps events in `recorder.events`, for tests.                                        |

### Production: filter and sampling

`createTracer(loggers, options)` can cut the volume:

```ts
createTracer(logger, {
  sample: 0.05, // trace 5% of the handler calls (a share, or a function of { type, payload })
  filter: (event) => event.phase === "error", // and keep only failures
});
```

- `sample` is decided once per root task (one handler call) and every task below it follows, so a trace is never cut in the middle. Tasks that are not sampled cost almost nothing: their effects run without tracing.
- `filter` runs on each event before any logger sees it.

Notes on `reduxDevtools`: it is read-only (the bus owns no state, so there is no time travel) and does nothing when the extension is not installed. It has its own instance in the DevTools picker, apart from your store.

It is quiet by default, so the log stays readable:

- **A task is one action**, sent when it ends (`done`, `error`, `cancel`, `drop`). The tasks that are running are in the state, `{ running }`. `starts: true` also sends every start.
- **Only the top is shown**: the handler tasks and the effects they start (`retry`, `timeout`, ...). The attempts and starters under them are hidden. `depth: 0` shows the handler tasks only, `depth: 3` more, `Infinity` everything.
- `maxAge: 200` sets how many actions DevTools keeps (its own default is 50).

```ts
reduxDevtools({ name: "app", depth: 0 }); // one line per handler call
reduxDevtools({ name: "app", starts: true, depth: Infinity }); // everything, for a hunt for a bug
```

For more control, `createTracer(logger, { filter, sample })` cuts events before any logger sees them.

To write your own, return a `TraceLogger`:

```ts
import type { TraceLogger } from "nanoeffects";

const errorsOnly = (): TraceLogger => (event) => {
  if (event.phase === "error") report(event.error);
};
```

## Removing tracing from a build

Without a tracer the hooks cost almost nothing (a lookup that finds no tracer), and `nanoeffects/trace` is a separate entry that is only bundled when imported. To also drop the tracing code from the core, use the `notrace` export condition: the package ships a second build of `index`, `effects`, `policies` and `actions` made with `__NANOEFFECTS_TRACE__` set to `false`, so the bundler removes the tracer calls.

```ts
// vite / rolldown
resolve: { conditions: ["notrace"] }
// webpack
resolve: { conditionNames: ["notrace", "import", "..."] }
// esbuild
conditions: ["notrace"]
```

In a build of your own from the sources, `define: { __NANOEFFECTS_TRACE__: "false" }` does the same. With the condition set, the types of that build have no `trace` option: `createBus({ trace })` is a type error, so tracing cannot be left on by mistake (`scripts/notrace-types.mjs` makes `BusOptions.trace` `never` there). `nanoeffects/trace` has no `notrace` build. The saving is about 0.4 kB gzip of the whole library.
