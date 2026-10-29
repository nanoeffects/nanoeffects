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
| `parentId` | Id of the task that started this one (absent for handler tasks) |
| `rootId` | Id of the root task of the chain; absent on the root itself, and it is the same through a listener that reports nothing |
| `type` | Event type the task works on |
| `effect` | `latest`, `debounce`, `throttle`, `leading`, `run`, `all`, `race`, … |
| `phase` | `start`, `done`, `error`, `cancel`, or `drop` |
| `payload` | Event payload |
| `error` | Thrown value, only for `error` |
| `traceGroupId` | The flow of the task, when it or a task above has one |

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

## Show which subscription began a chain

**Problem.** `useEmitter` and `bus.emitter` put an event on the bus from outside any task, such as a render or the callback of a store. In the trace that event has no sign of where it came from. With many such subscriptions it is hard to tell which one started a chain of commands and retries.

**When.** The bus has a tracer and the project has several `useEmitter` or `bus.emitter` calls. The names come from `tracePlugin`: use it on the bus, or the `traceId` is ignored.

Give each one a `traceId`. When the bus has a tracer, the emit is made from a root task with that `traceId` as its `type` and `run` as its effect. What the event starts is below it. Without a tracer nothing changes.

```js
import { createBus } from "nanoeffects";
import { createAction, emitterPlugin } from "nanoeffects/actions";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: reports every task phase to the console
const bus = createBus({ trace: createTracer(consoleLogger()) })
  .use(tracePlugin()) // tracePlugin: makes the root task that traceId names
  .use(emitterPlugin());

const cartChanged = createAction("cart/changed");

// emitter: a callback for a store; traceId names it in the trace
const emitCartChanged = bus.emitter(cartChanged, { traceId: "cartStore" });
```

In a component, the same option goes in the options of the hook: `useEmitter(nameChanged, name, { traceId: "Profile" })`. In the console:

```
[nanoeffects] Profile · run start
[nanoeffects]   user/save · command start
[nanoeffects]   user/save · command done
[nanoeffects] Profile · run done
```

A `traceId` is a string you choose and keep stable: the name of the component or of the store. Without one the root has the type of the event.

Two things to know:

- **`sample` sees the `traceId`.** The root of an emitter is a task like any other, so a `sample` function gets `{ type, payload }` with the `traceId` as the `type` and the emitted action as the `payload`. A function that matches on the type of the event, such as `event.type === "search"`, does not pick a root that has another `traceId`; match the `traceId`, or the `payload.type`.
- **Inside a handler, emit with `ctx.emit`.** `ctx.emit` keeps the chain: what it starts is below the handler. A plain `bus.emit` inside a handler starts a new root with no parent and no `rootId`, so the trace loses the link.

Every event of a task below another one has `rootId`, the id of the root of the chain, also when a listener, which reports nothing, stands in between. `parentId` is the task directly above, which can be such a listener.

## Follow one flow with a traceGroupId

**Problem.** A flow such as a checkout has several roots (a click, a timer, a store) and many branches. Parent ids give a tree, but you want to filter the log by the flow.

**When.** One business flow runs through several commands, and you read the log by flow.

Give the flow a `traceGroupId` in the scope of the command, the job or the action that starts it. Every task that it starts through `ctx.emit` or `ctx.run` has the same `traceGroupId`, and so does every trace event of those tasks. A task that declares its own `traceGroupId` uses it for itself and for what it starts.

```js
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// tracePlugin: reads traceGroupId from the scope of a call
const bus = createBus({ trace: createTracer(consoleLogger()) }).use(tracePlugin());

// the scope names the flow; traceGroupId is for the tracer, not a field of ctx
const pay = createCommand("checkout/pay", async () => {}, {
  traceGroupId: "checkout",
});
```

```
[nanoeffects] [checkout] checkout/pay · command start
```

The emitters take it too: `useEmitter(cartChanged, cart, { traceId: "Cart", traceGroupId: "checkout" })`. `traceGroupId` works without `scopePlugin`, and needs `tracePlugin`.

## Name a listener

**Problem.** The log shows what started a chain and what it started, but a listener of an event reports nothing, so you cannot tell which of several listeners ran.

**When.** An event has more than one listener and you read the trace to see which one did the work.

Give the listener a `traceId` when you register it. The plugin makes each call of it a task with that name, and what it emits with `ctx.emit` is below it. `off` works as before. It also works in a module (`m.on(event, handler, { traceId })`) and on an instance made by `extendBus`.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

const bus = createBus({ trace: createTracer(consoleLogger()) }).use(tracePlugin());

// traceId: the name of this listener in the trace
bus.on("name/changed", saveName, { traceId: "saveNotifier" });
bus.once("name/changed", (name) => console.log(name), { traceId: "auditLog" });
```

```
[nanoeffects] saveNotifier · run start
[nanoeffects]   user/save · command start
[nanoeffects] saveNotifier · run done
```

## Turn the names off

`tracePlugin` is optional, and none of it changes how your code runs:

- **Without the plugin**, or on a bus without a tracer, `traceId` and `traceGroupId` are ignored. Handlers run as they are, with the same results, errors and rejections, and `onError` sees the same errors.
- **The types are the same** with and without the plugin, so you can use it only in development: `if (isDev) bus.use(tracePlugin())` compiles in both builds.
- **A `traceGroupId` in a scope** is never put on `ctx`.

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
