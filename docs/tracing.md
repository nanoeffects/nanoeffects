# Trace tasks

> **Level F.** Read first: [Guide](guide.md#1-create-a-bus) steps 1 and 2.

Find out what your app did and why: which events were emitted, which calls a policy cancelled or dropped, which request failed. You see it in the browser console, in Redux DevTools, or in the Performance panel.

Tracing is optional. A bus works the same without it, and it costs almost nothing until you turn it on. If you only want to see what happens while you develop, jump to [Show every emit](#show-every-emit) and [Configure Redux DevTools](#configure-redux-devtools); the rest of the page is for apps that need to follow a flow or turn tracing off in a build.

## On this page

- [Attach a tracer](#attach-a-tracer)
- [Show every emit](#show-every-emit)
- [Show which subscription began a chain](#show-which-subscription-began-a-chain)
- [Follow one flow with a traceGroupId](#follow-one-flow-with-a-tracegroupid)
- [Name a listener](#name-a-listener)
- [List who listens](#list-who-listens)
- [Find the line of a listener](#find-the-line-of-a-listener)
- [Keep the chain: `ctx.emit`, not `bus.emit`](#keep-the-chain-ctxemit-not-busemit)
- [Turn the names off](#turn-the-names-off)
- [Use built-in loggers](#use-built-in-loggers)
  - [Cut volume in production](#cut-volume-in-production)
  - [Keep the last events for an incident](#keep-the-last-events-for-an-incident)
  - [Measure time and find open tasks](#measure-time-and-find-open-tasks)
  - [Find the cause of an error](#find-the-cause-of-an-error)
  - [Configure Redux DevTools](#configure-redux-devtools)
  - [Find loops with `graphLogger`](#find-loops-with-graphlogger)
  - [Send safe data to a tool](#send-safe-data-to-a-tool)
  - [Write your own logger](#write-your-own-logger)
  - [Stop on an event](#stop-on-an-event)
- [Drop tracing from a build](#drop-tracing-from-a-build)

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
| `effect` | `latest`, `debounce`, `throttle`, `leading`, `run`, `all`, `race`, …; `emit` for the emit event of `tracePlugin` |
| `phase` | `start`, `done`, `error`, `cancel`, or `drop` |
| `payload` | Event payload |
| `error` | Thrown value, only for `error` |
| `traceGroupId` | The flow of the task, when it or a task above has one |

Phases:

- `start` — the work began.
- `done` / `error` — it finished or threw.
- `cancel` — aborted after it started (superseded by `latest`, parent aborted, lost a `race`).
- `drop` — never started (`leading` while busy, a `throttle` call replaced by a newer one, a `debounce` call replaced before its delay ended).

`all` and `race` are traced when you pass them the handler `ctx`: the group is one task; every function of the group is a child `run` task.

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

## Show every emit

**When.** You want the log to say what was emitted, also when nothing listens or the listener is a plain function. Without it the trace has only the tasks that report: a policy (`latest`, ...) or a `ctx.run`.

`tracePlugin` reports one event for each emit, with `effect: "emit"` and `phase: "done"`, before the handlers run. `type` is the event name and `payload` is what was emitted. A `ctx.emit` has the task that emits as its `parentId`.

```js
// bus.js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: sends each trace event to the logger; consoleLogger: prints one line each
const trace = createTracer(consoleLogger());

export const bus = createBus({ trace })
  .use(tracePlugin()); // tracePlugin: reports each emit as an event
```

```js
import { bus } from "./bus";

bus.emit("search", "nano"); // logs: search · emit done
```

The event changes nothing else: the other tasks keep their `parentId`, `rootId` and `traceGroupId`. Without the plugin the trace has no `emit` events.

- **What counts as an emit.** Every `bus.emit`, also the ones a library makes for you: a job emits its `pending` and `success` (or `fail`, `cancel`), so one call of a job is several `emit` events.
- **Cost.** One small task per emit, about 60 ns on a bus that already has a tracer (a bus with a tracer and no plugin: about 250 ns more than a bus without one). `sample` and `filter` of `createTracer` cut it in the log, not in the work.

## Show which subscription began a chain

**Problem.** `useEmitter` and `bus.emitter` put an event on the bus from outside any task, such as a render or the callback of a store. In the trace that event has no sign of where it came from. With many such subscriptions it is hard to tell which one started a chain of actions and retries.

**When.** The bus has a tracer and the project has several `useEmitter` or `bus.emitter` calls. The names come from `tracePlugin`: use it on the bus, or the `traceId` is ignored.

Give each one a `traceId`. When the bus has a tracer, the emit is made from a root task with that `traceId` as its `type` and `run` as its effect. What the event starts is below it. Without a tracer nothing changes.

```js
import { createBus } from "nanoeffects";
import { createAction, emitterPlugin } from "nanoeffects/actions";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: reports every task phase to the console
const trace = createTracer(consoleLogger());

const bus = createBus({ trace })
  .use(tracePlugin()) // tracePlugin: makes the root task that traceId names
  .use(emitterPlugin());

const cartChanged = createAction("cart/changed");

// emitter: a callback for a store; traceId names it in the trace
const emitCartChanged = bus.emitter(cartChanged, { traceId: "cartStore" });
```

In a component, the same option goes in the options of the hook: `useEmitter(nameChanged, name, { traceId: "Profile" })`. In the console:

```
[nanoeffects] Profile · run start
[nanoeffects]   user/save · action start
[nanoeffects]   user/save · action done
[nanoeffects] Profile · run done
```

A `traceId` is a string you choose and keep stable: the name of the component or of the store. Without one the root has the type of the event.

Two things to know:

- **`sample` sees the `traceId`.** The root of an emitter is a task like any other, so a `sample` function gets `{ type, payload }` with the `traceId` as the `type` and the emitted action as the `payload`. A function that matches on the type of the event, such as `event.type === "search"`, does not pick a root that has another `traceId`; match the `traceId`, or the `payload.type`.
- **Inside a handler, emit with `ctx.emit`.** `ctx.emit` keeps the chain: what it starts is below the handler. A plain `bus.emit` inside a handler starts a new root with no parent and no `rootId`, so the trace loses the link.

Every event of a task below another one has `rootId`, the id of the root of the chain, also when a listener, which reports nothing, stands in between. `parentId` is the task directly above, which can be such a listener.

## Follow one flow with a traceGroupId

**Problem.** A flow such as a checkout has several roots (a click, a timer, a store) and many branches. Parent ids give a tree, but you want to filter the log by the flow.

**When.** One business flow runs through several actions, and you read the log by flow.

Give the flow a `traceGroupId` in the scope of the action or the job that starts it. Every task that it starts through `ctx.emit` or `ctx.run` has the same `traceGroupId`, and so does every trace event of those tasks. A task that declares its own `traceGroupId` uses it for itself and for what it starts.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: sends each trace event to the logger; consoleLogger: prints one line each
const trace = createTracer(consoleLogger());

// tracePlugin: reads traceGroupId from the scope of a call
const bus = createBus({ trace })
  .use(tracePlugin());

// the scope names the flow; traceGroupId is for the tracer, not a field of ctx
const pay = createAction("checkout/pay", async () => {}, {
  traceGroupId: "checkout",
});
```

```
[nanoeffects] [checkout] checkout/pay · action start
```

The emitters take it too: `useEmitter(cartChanged, cart, { traceId: "Cart", traceGroupId: "checkout" })`. `traceGroupId` works without `scopePlugin`, and needs `tracePlugin`.

## Name a listener

**Problem.** The log shows what started a chain and what it started, but a listener of an event reports nothing, so you cannot tell which of several listeners ran.

**When.** An event has more than one listener and you read the trace to see which one did the work.

A listener is named by its function when you register one with a name (`function saveName() {}`), so a log of an app that nobody annotated is already readable. An inline arrow has no name and stays as it is. To choose the name, or to name an arrow, give the listener a `traceId` when you register it; it wins over the function name. The plugin makes each call of a named listener a task with that name, and what it emits with `ctx.emit` is below it. A minifier can shorten function names in a production build: use `traceId` where a name must stay stable, and for a handler that a policy returns (`latest(fn)`), which has no name of its own. `off` works as before. It also works in a module (`m.on(event, handler, { traceId })`) and on an instance made by `extendBus`.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer: sends each trace event to the logger; consoleLogger: prints one line each
const trace = createTracer(consoleLogger());

const bus = createBus({ trace })
  .use(tracePlugin());

// traceId: the name of this listener in the trace
bus.on("name/changed", saveName, { traceId: "saveNotifier" });
bus.once("name/changed", (name) => console.log(name), { traceId: "auditLog" });
```

```
[nanoeffects] saveNotifier · run start
[nanoeffects]   user/save · action start
[nanoeffects] saveNotifier · run done
```

## List who listens

**Problem.** To know what an emit will start, you search the code for every `bus.on` of that event.

**When.** You read an app that you did not write, or a test must guard the wiring of the bus.

`describeBus(bus)` returns the listeners that each event has right now, by name and in the order they were added. A name is the `traceId`, else the function name, else `"<anonymous>"`. It reads what `tracePlugin` keeps, so it returns `{}` on a bus without the plugin or a tracer, and in the `notrace` build. It does not run anything and does not change the bus.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, describeBus, tracePlugin } from "nanoeffects/trace";

function saveName(name) {
  console.log("save", name);
}

function audit(name) {
  console.log("audit", name);
}

const trace = createTracer(consoleLogger());

const bus = createBus({ trace })
  .use(tracePlugin());

bus.on("name/changed", saveName);
bus.on("name/changed", audit);
bus.on("saved", () => {}, { traceId: "refreshView" });

// describeBus: the map of events to listener names
console.log(describeBus(bus));
```

```
{ "name/changed": ["saveName", "audit"], saved: ["refreshView"] }
```

## Find the line of a listener

**Problem.** The log says that `saveNotifier` ran, and you must search the code for the `bus.on` that registered it. An inline arrow has no name at all, so it is not in the log.

**When.** You debug in development and want to jump from a log line to the code.

Pass `source: true` to `tracePlugin`. It reads the place of each `bus.on` and `bus.once` call once, when the listener is registered, and never on `emit`. The events of the listener get a `source` (`file:line:column`), `consoleLogger({ source: true })` prints it, and `describeBus(bus, { source: true })` lists it. An anonymous listener is reported too, under the type of its event and a number: `name/changed#1`, `name/changed#2`, in the order of registration. Two inline listeners on one event are two entries, and the place stays in `source`. Adding or reordering `bus.on` calls renumbers them, so give a `traceId` to a listener whose name must stay the same between builds.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, describeBus, tracePlugin } from "nanoeffects/trace";

// source: print where the listener was registered
const trace = createTracer(consoleLogger({ source: true }));

// source: read the place of each bus.on, once at registration
const bus = createBus({ trace })
  .use(tracePlugin({ source: true }));

function saveName(name) {
  console.log("save", name);
}

bus.on("name/changed", saveName);
bus.on("name/changed", (name) => console.log("audit", name));

bus.emit("name/changed", "Eva");

// describeBus: the same places, without running anything
console.log(describeBus(bus, { source: true }));
```

```
[nanoeffects] saveName · run start (file:///app/src/user.js:13:5)
[nanoeffects] name/changed#1 · run start (file:///app/src/user.js:14:5)
{ "name/changed": ["saveName (file:///app/src/user.js:13:5)", "<anonymous> (file:///app/src/user.js:14:5)"] }
```

Know the limits:

- **Minified or bundled code** gives the line of the bundle. Turn on source maps (`node --enable-source-maps`, or the browser's) to see the original line.
- **`ctx.on` called by hand** inside a handler shows the line in the library as its place. The `on` of a module and of an instance made by `extendBus`, and the `on` of `matchPlugin`, `signalPlugin` and `devPlugin`, show your line, in any order of plugins and in a bundle.
- **No stack**, as with `Error.stackTraceLimit = 0`, gives no `source`. The listener runs as usual.
- **The default is off.** Reading a stack costs a little for each registration, so turn it on in development.

## Keep the chain: `ctx.emit`, not `bus.emit`

Inside a handler, emit with `ctx.emit`. It keeps the chain: what it starts is below the handler, and its events have the `rootId` of the chain. A plain `bus.emit` inside a handler starts a new root with no `parentId` and no `rootId`, so the trace loses the link. The bus cannot warn about it, because it does not know which handler is running.

The names work wherever an event or a listener is made:

| Where | How to name it |
| ----- | -------------- |
| `useEmitter` and `bus.emitter` | `{ traceId, traceGroupId }` in the options |
| A Redux dispatch | `createEffectsMiddleware(bus, { traceId, traceGroupId })` |
| A listener, `bus.on` and `bus.once` | `{ traceId }` as the third argument |
| A listener of a module or of an instance of `extendBus` | the same third argument of its `on` and `once` |
| A method with `@On` or `@Once` | `{ traceId }` in the decorator |
| An action or a job | `traceGroupId` in its scope |

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
| `reduxDevtools()` | Sends the emits to Redux DevTools, and with `policies` the stages of the handlers as `type/effect/phase`; state is `{ running }` |
| `consoleLogger()` | Prints one line per phase, indented by task depth |
| `performanceLogger()` | User Timing measures for the browser Performance panel |
| `createTraceRecorder()` | Keeps events in `recorder.events`: all of them for tests, or with `{ capacity }` the last N ([see below](#keep-the-last-events-for-an-incident)) |
| `graphLogger()` | Builds the map of which event leads to which, finds loops while the app runs, and writes the map as Mermaid, Graphviz or JSON ([see below](#find-loops-with-graphlogger)); [`mergeGraphs` and `findOrphans`](debugging-loops.md#find-listeners-that-never-ran) join runs and find listeners that never ran |

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

### Keep the last events for an incident

`createTraceRecorder()` with no option keeps every event, so a long session fills memory. That is fine in a test and wrong in a running app. Give it a `capacity` and it keeps only the last N events (a ring buffer): when something goes wrong, you still have what led up to it.

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";
import { createTraceRecorder, createTracer } from "nanoeffects/trace";

// A logger that keeps the last 500 events and drops the older ones.
export const recorder = createTraceRecorder({ capacity: 500 });

// Feed the recorder from the tracer.
const trace = createTracer(recorder);

export const bus = createBus({ trace });
```

```js
// incident.js
import { recorder } from "./bus";

// Keep what is safe to send. An event also has `payload` and `error`.
const withoutPayload = ({ id, parentId, type, effect, phase }) => ({
  id,
  parentId,
  type,
  effect,
  phase,
});

window.addEventListener("error", () => {
  const events = recorder.events; // a snapshot, oldest event first
  const safe = events.map(withoutPayload);
  const body = JSON.stringify(safe);
  navigator.sendBeacon("/api/incident", body);
});
```

What to know before you send the events:

- **`payload` and `error` can hold private data**: what a user typed, tokens, personal text. The recorder keeps them as they are and does not redact. Choose what to send, as `withoutPayload` does.
- **There is no time on an event.** You get the order, not the duration. [`timingLogger`](#measure-time-and-find-open-tasks) measures time.
- **An old `parentId` can point at an event that was pushed out.** When you build a tree from the events, treat an unknown `parentId` as a root.
- **`recorder.events` is a snapshot with a `capacity`.** Each read builds a new array, so read it once at the moment you need it. Without a `capacity` it is one live array.
- **A low `sample` thins the buffer.** `createTracer(recorder, { sample: 0.05 })` records 5% of root tasks, so the buffer may hold little when the incident comes. See [Cut volume in production](#cut-volume-in-production).
- **A `capacity` that is not a positive integer** (`0`, a negative number, `NaN`) means no limit.

### Measure time and find open tasks

An event has no time, so the recorder cannot tell you which handler is slow, how long a request lived before `cancel`, or whether a test left something running. `timingLogger` stamps the time on each event when it gets it and pairs `start` with the first closing phase (`done`, `error`, `cancel` or `drop`) of the same task.

Pass it to the tracer next to the recorder: `createTracer` takes an array of loggers.

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";
import { createTraceRecorder, createTracer, timingLogger } from "nanoeffects/trace";

// createTraceRecorder: events in the order they came
export const recorder = createTraceRecorder();

// timingLogger: the time of each event and the duration of tasks
export const timing = timingLogger();

// createTracer: both loggers get every event
const trace = createTracer([recorder, timing]);

export const bus = createBus({ trace });
```

```js
// check.js
import { timing } from "./bus";

// durations: the tasks that ended, with the closing phase and the time in ms
const slow = timing.durations.filter((task) => task.ms > 500);
console.log(slow);

// pending: the tasks that started and have not ended
const leftovers = timing.pending();
if (leftovers.length > 0) {
  throw new Error(`${leftovers.length} tasks are still open`);
}
```

What to know:

- **The clock.** Time comes from `performance.now()`, or `Date.now()` where there is none. In a test pass your own clock: `timingLogger({ now })`.
- **`capacity` cuts only `durations`.** `timingLogger({ capacity: 200 })` keeps the last 200 ended tasks. `pending()` is never cut: a leak shows up as a growing list.
- **`clear()`** empties both lists. Call it between tests.
- **The logger sees what the tracer lets through.** A task whose `start` was filtered out or not sampled gets no pair, and its ending is ignored.

### Find the cause of an error

An error arrives as one event, and you cannot see what led to it. `chainOf` builds the path from the root to a task by `parentId`. Give it the recorder: then the listeners that send no event (a plain handler that calls `ctx.emit`) are in the path too.

```js
// why.js
import { chainOf } from "nanoeffects/trace";
import { recorder } from "./bus";

const failed = recorder.events.find((event) => event.phase === "error");

// chainOf: the path from the root to the failed task
const path = chainOf(recorder, failed.id);

const text = path.map((step) => step.type).join(" → ");
console.log(text); // queryChanged → searchLoaded
```

A step has `type`, and `effect` and `phase` (a listener with no events has neither), `source` and `traceGroupId` when known. If you pass a list of events (a snapshot, a file) instead of the recorder, the path holds only the tasks that have events.

To see the path right in the console, turn on `chain` in `consoleLogger`:

```js
import { consoleLogger, createTracer } from "nanoeffects/trace";

// consoleLogger: the line of an error ends with the path from the root
const trace = createTracer(consoleLogger({ chain: true }));
// [nanoeffects] render · run error (queryChanged → render)
```

`chain` remembers the last 1000 tasks. It is off by default.

### Configure Redux DevTools

<!-- docs-check: new -->

Read-only (the bus owns no state, so there is no time travel). Does nothing when the extension is not installed. Has its own instance in the DevTools picker, apart from your store.

Quiet by default, so you see what happened before you see how:

- **One action per emit**, named after the event (`search`), with its payload. This needs `bus.use(tracePlugin())` (see [Show every emit](#show-every-emit)); without it the default log is empty, and the logger prints one `console.warn` when the first handler task ends with no emit before it.
- **A failed handler** is sent as `search/latest/error`.
- Nothing else: no start, no `done`, no policy stages, no effects.

Turn on more when you need it:

- `policies` — the stages of the handler tasks, as `event/policy/phase`. `true` shows every phase, a list shows those phases, a function gets `{ effect, phase }`.
- `starts: true` — also send the start of each shown task. Running tasks are in the state `{ running }`.
- `depth: 1` — also the effects a handler starts (`retry`, `timeout`); `depth: Infinity` — everything below.
- `payload` — which actions carry the payload of their event:
  - `"essential"` (default) — the emit actions, and the `cancel`, `drop` and `error` of a task, where the payload is the only way to tell which call it was. `start` and `done` repeat the emit and have none, so a large payload is sent once.
  - `"all"` — every action, as in 0.12.
  - `"none"` — no action. Use it for a payload that is large, or holds data that must not reach the browser extension (tokens, personal data). You can then no longer tell which call a policy stopped.
- `maxAge: 200` — how many actions DevTools keeps (its default is 50).

```js
// bus.js
import { createBus } from "nanoeffects";
import { createTracer, reduxDevtools, tracePlugin } from "nanoeffects/trace";

// reduxDevtools: sends the trace to the extension; it has the emits and the failures only
const logger = reduxDevtools({ name: "app" });

export const bus = createBus({ trace: createTracer(logger) })
  .use(tracePlugin()); // tracePlugin: makes the emit events
```

```js
import { reduxDevtools } from "nanoeffects/trace";

// debugging a race: which calls did a policy cancel or drop?
reduxDevtools({
  name: "app",
  policies: ["cancel", "drop"],
});

// every stage of every policy, one function for the choice
reduxDevtools({
  name: "app",
  policies: ({ effect, phase }) => effect === "latest" && phase !== "start",
});

// the old log: every stage, and the effects below the handlers
reduxDevtools({
  name: "app",
  policies: true,
  depth: 1,
  payload: "all",
});

// keep the payloads out of the extension
reduxDevtools({
  name: "app",
  payload: "none",
});
```

With two quick `search` emits and a `latest` handler, the default list is `search`, `search`. With `policies: true` it adds the `latest` stages of each call, for example `search/latest/cancel` for the first one.

### Find loops with `graphLogger`

Two handlers that emit each other's events never stop. `graphLogger` is a logger that finds such a loop while the app runs, writes a report once for it, and keeps the map of the events so you can draw it.

```js
// bus.js
import { createBus } from "nanoeffects";
import { createTracer, graphLogger, tracePlugin } from "nanoeffects/trace";

// graphLogger — the map of events and the loop finder, in one logger
export const graph = graphLogger({ name: "app" });

// createTracer — sends every task of the bus to the logger
const trace = createTracer(graph);

// tracePlugin — also reports each emit; the logger works without it, with a coarser map
export const bus = createBus({ trace }).use(tracePlugin());

// graph.cycles() lists the loops found; graph.toMermaid() draws the map
```

It reports a node that is in one chain three times, a storm of emits from outside any handler, and a chain that starts too many tasks. It writes to `console.warn`, or to `onCycle`, or to Redux DevTools with `devtools: true`. Nothing is stopped: to cut a loop use [`loopGuardPlugin`](loop-guard.md). The full walk-through, with scenarios you can run, is [Find and cut event loops](debugging-loops.md).

### Send safe data to a tool

A payload or an error can be anything: a class instance, a `Map`, a circular object, a function, an `Error` with a `cause`. A tool that gets such a value as it is can fail or show nothing. The built-in loggers make sure that what leaves your process is plain data:

| Logger | What it does with a payload and an error |
| ------ | ---------------------------------------- |
| `reduxDevtools()` | Makes both plain data with `safeSerialize` before the extension gets them. An `Error` is sent as its message. `serialize` changes this. |
| `performanceLogger()` | Sends ids and the phase; an error is text. A payload is not sent. |
| `consoleLogger()` | Passes the value to `console`, which prints any value and keeps it open for you to inspect. |
| `createTraceRecorder()` | Keeps the events as they are. `recorder.toJSON()` and `JSON.stringify(recorder)` give plain data. |
| `graphLogger()` | Exports no payload unless you ask, and then makes it plain. |

`safeSerialize(value)` is exported for your own logger. It never throws and never loops: an `Error` keeps its name, message, stack and cause, a cycle becomes `"[Circular]"`, a `Map` becomes `{ $map }`, a `Set` becomes `{ $set }`, an instance of a class keeps its own fields and its name as `$class`, and a getter is never called. A value that is too deep or too big is cut.

```js
import { createTracer, reduxDevtools, safeSerialize } from "nanoeffects/trace";

const trace = createTracer(
  reduxDevtools({
    name: "app",
    // serialize — runs on every payload and error before the extension gets it;
    // hide a secret first, then make the rest plain
    serialize: (value) => safeSerialize(value, { maxDepth: 4 }),
  }),
);
```

`serialize: false` sends values as they are, which is faster and can fail on a circular one.

### Write your own logger

```ts
import type { TraceLogger } from "nanoeffects/trace";

const errorsOnly = (): TraceLogger => (event) => {
  if (event.phase === "error") {
    report(event.error);
  }
};
```

### Stop on an event

You want the debugger to stop when a certain event comes. No API is needed for that: it is five lines in a logger of your own.

```js
import { createTracer } from "nanoeffects/trace";

// A logger that stops in the debugger at the start of a task with this type
const stopOn = (type) => (event) => {
  if (event.type === type && event.phase === "start") {
    debugger; // the browser stops here when DevTools is open
  }
};

// createTracer: pass the logger like any other
const trace = createTracer(stopOn("search"));
```

In the debugger read `event.payload` and walk up the stack: the synchronous part of the chain is all there.

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
