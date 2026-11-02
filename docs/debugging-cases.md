# Debugging cases

> **Level F.** Read first: [Trace tasks](tracing.md#attach-a-tracer).

Read this page when something goes wrong and you want to know who listens to an event, what began a chain, or why a request stopped. Each case below is a short snippet that you can run. For loops, see [Find and cut event loops](debugging-loops.md).

## On this page

- [Find who listens to an event](#find-who-listens-to-an-event)
- [Find which task began a chain](#find-which-task-began-a-chain)
- [Find out why a request stopped](#find-out-why-a-request-stopped)
- [Know what is missing](#know-what-is-missing)

## Find who listens to an event

**Problem.** You read an emit and want to know what it starts.

Name the listeners with functions or a `traceId`, use `tracePlugin`, and call `describeBus`:

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

// describeBus: the listeners of each event, in the order they run
console.log(describeBus(bus));
```

```
{ "name/changed": ["saveName", "audit"] }
```

Details: [List who listens](tracing.md#list-who-listens).

## Find which task began a chain

**Problem.** A request ran and you do not know what asked for it.

Every task of a trace has a `rootId` and a `parentId`. The recorder keeps them, so you can walk up from the request to the emit that began it:

```js
import { createBus } from "nanoeffects";
import { createTraceRecorder, createTracer, tracePlugin } from "nanoeffects/trace";

// createTraceRecorder: keeps the last events in memory
const recorder = createTraceRecorder();
const trace = createTracer(recorder);

const bus = createBus({ trace })
  .use(tracePlugin());

function loadUser(id, ctx) {
  ctx.emit("user/loading", id);
}

bus.on("user/open", loadUser);
bus.emit("user/open", 7);

// each event says which task is its parent
for (const event of recorder.events) {
  console.log(event.id, event.parentId, event.type, event.phase);
}
```

Details: [Show which subscription began a chain](tracing.md#show-which-subscription-began-a-chain) and [Keep the chain: `ctx.emit`, not `bus.emit`](tracing.md#keep-the-chain-ctxemit-not-busemit).

## Find out why a request stopped

**Problem.** A search request never finished and no error appeared.

A policy that stops a call reports `cancel` or `drop` in the trace. Pick the call and read its last phase:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { createTraceRecorder, createTracer, tracePlugin } from "nanoeffects/trace";

const recorder = createTraceRecorder();
const trace = createTracer(recorder);

const bus = createBus({ trace })
  .use(tracePlugin());

// latest: a new search stops the one that is still running
const search = latest(async (query, ctx) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  ctx.emit("search/loaded", query);
});

bus.on("search/changed", search, { traceId: "search" });
bus.emit("search/changed", "a");
bus.emit("search/changed", "ab");

// a "cancel" phase on the first call says that the second one stopped it
const phases = recorder.events.map((event) => `${event.type}:${event.phase}`);
console.log(phases);
```

Details: [Trace tasks](tracing.md) and [Cancel stale requests](cancel-stale-requests.md).

## Know what is missing

- **No browser extension or UI of its own.** Use [Redux DevTools](tracing.md#configure-redux-devtools), the console or the Performance panel.
- **No map from the source code.** `describeBus` lists the listeners registered so far, and `graphLogger` shows the events that happened. A listener that is not registered yet is not on the map.
- **No click-through from the log to the code.** With `tracePlugin({ source: true })` an event carries the `file:line:column` of its listener ([Find the line of a listener](tracing.md#find-the-line-of-a-listener)), but a link in a UI is yours to build.
- **No names from a compiler.** Function names give a name for free; a minifier can shorten them, so use `traceId` where a name must stay stable.
- **No replay and no time travel.** The recorder keeps what happened and cannot run it again.
