# Trace tasks

Reference for long-lived apps that need to observe task phases, Redux DevTools, or a build without tracing. Not part of onboarding.

## Attach a tracer

Pass `trace` to `createBus`. Make it with `createTracer` from `nanoeffects/trace`, which takes a logger (a function) or an array of them. The tracing code lives in that entry, so a bus without `trace` does not carry it.

```js
import { createBus } from "nanoeffects";
import { createTracer } from "nanoeffects/trace";

const bus = createBus({
  // createTracer — observe every task phase
  trace: createTracer((event) => console.log(event)),
});
```

Each `TraceEvent` has:

| Field | Meaning |
| ----- | ------- |
| `id` | Unique task id within the bus |
| `parent` | Id of the task that started this one (absent for handler tasks) |
| `type` | Event type the task works on |
| `effect` | `latest`, `debounce`, `throttle`, `leading`, `run`, `all`, `race`, … |
| `phase` | `start`, `done`, `error`, `cancel`, or `drop` |
| `payload` | Event payload |
| `error` | Thrown value, only for `error` |

Phases:

- `start` — the work began.
- `done` / `error` — it finished or threw.
- `cancel` — aborted after it started (superseded by `latest`, parent aborted, lost a `race`).
- `drop` — never started (`leading` while busy, a `throttle` call replaced by a newer one, a `debounce` call replaced before its delay ended).

`all` and `race` are traced when you pass them the handler `ctx`: the group is one task; every starter is a child `run` task.

```js
import { createBus } from "nanoeffects";
import { all } from "nanoeffects/effects";

const bus = createBus();

bus.on("load", async (id, ctx) => {
  await all(ctx, {
    user: () => fetchUser(id),
    posts: () => fetchPosts(id),
  });
});
```

## Use built-in loggers

A logger is `(event) => void`. `createTracer` takes one logger or an array. A logger that throws is reported to `console.error` and never breaks the task or the other loggers.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, reduxDevtools } from "nanoeffects/trace";

const bus = createBus({
  trace: createTracer([reduxDevtools({ name: "app" }), consoleLogger()]),
});
```

| Logger | What it does |
| ------ | ------------ |
| `reduxDevtools()` | Sends tasks to Redux DevTools as `type/effect/phase`; state is `{ running }` |
| `consoleLogger()` | Prints one line per phase, indented by task depth |
| `performanceLogger()` | User Timing measures for the browser Performance panel |
| `createTraceRecorder()` | Keeps events in `recorder.events`, for tests |

### Cut volume in production

```js
import { createTracer } from "nanoeffects/trace";

createTracer(logger, {
  sample: 0.05, // trace 5% of handler calls (share, or function of { type, payload })
  filter: (event) => event.phase === "error", // keep only failures
});
```

- `sample` is decided once per root task; every task below it follows, so a trace is never cut in the middle. Unsampled tasks cost almost nothing.
- `filter` runs on each event before any logger sees it.

### Configure Redux DevTools

Read-only (the bus owns no state, so there is no time travel). Does nothing when the extension is not installed. Has its own instance in the DevTools picker, apart from your store.

Quiet by default:

- **A task is one action**, sent when it ends (`done`, `error`, `cancel`, `drop`). Running tasks are in `{ running }`. `starts: true` also sends every start.
- **Only the top is shown**: handler tasks and the effects they start. Attempts and starters under them are hidden. `depth: 0` — handlers only; `depth: 3` — more; `Infinity` — everything.
- `maxAge: 200` — how many actions DevTools keeps (its default is 50).

```js
import { reduxDevtools } from "nanoeffects/trace";

reduxDevtools({ name: "app", depth: 0 }); // one line per handler call
reduxDevtools({ name: "app", starts: true, depth: Infinity }); // everything
```

### Write your own logger

```ts
import type { TraceLogger } from "nanoeffects";

const errorsOnly = (): TraceLogger => (event) => {
  if (event.phase === "error") {
    report(event.error);
  }
};
```

## Drop tracing from a build

Without a tracer the hooks cost almost nothing. `nanoeffects/trace` is only bundled when imported.

To also drop tracing code from the core, use the `notrace` export condition. The package ships a second build of `index`, `effects`, `policies`, and `actions` with `__NANOEFFECTS_TRACE__` set to `false`.

```js
// vite / rolldown
resolve: { conditions: ["notrace"] }
// webpack
resolve: { conditionNames: ["notrace", "import", "..."] }
// esbuild
conditions: ["notrace"]
```

In a build from the sources, `define: { __NANOEFFECTS_TRACE__: "false" }` does the same. With the condition set, that build’s types have no `trace` option: `createBus({ trace })` is a type error. `nanoeffects/trace` has no `notrace` build. The saving is about 0.4 kB gzip of the whole library.
