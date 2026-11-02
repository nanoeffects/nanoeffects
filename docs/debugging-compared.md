# Debugging compared with RxJS, Effector and mitt

> **Level F.** Read first: [Trace tasks](tracing.md#attach-a-tracer).

Read this page if you know RxJS, Effector or mitt and want to know what nanoeffects gives you when something goes wrong, and what it does not. It compares what each tool shows, then answers three questions you ask in a debugger. It is not a migration guide: for that, see [RxJS](migrating-from-rxjs.md), [Effector](migrating-from-effector.md) and [mitt](migrating-from-mitt.md).

## On this page

- [Compare what you can see](#compare-what-you-can-see)
- [Find who listens to an event](#find-who-listens-to-an-event)
- [Find which task began a chain](#find-which-task-began-a-chain)
- [Find out why a request stopped](#find-out-why-a-request-stopped)
- [Know what is missing](#know-what-is-missing)

## Compare what you can see

| Question | nanoeffects | RxJS | Effector | mitt / nanoevents |
| -------- | ----------- | ---- | -------- | ----------------- |
| Which task started which? | Yes: every task has `parentId` and `rootId` ([Trace tasks](tracing.md)) | You add `tap` per stream, or a tool such as [rxjs-spy](https://github.com/cartant/rxjs-spy) | Yes, through [`effector-logger`](https://github.com/effector/logger) and the [inspector](https://github.com/effector/inspector) | No |
| Was a call cancelled or dropped? | Yes: the phases `cancel` and `drop` | An unsubscribe shows no event unless you add one | — | No |
| A log of every emit | `tracePlugin` reports each emit, also with no listener | `tap` per stream | A logger over the units | A `"*"` listener |
| A map of the app | `describeBus` before a run, `graphLogger` after ([Find and cut event loops](debugging-loops.md)) | Not built in | The graph of units, with names from the Babel/SWC plugin | `emitter.all` holds the handlers of each event (mitt) |
| Find a loop | `graphLogger`, then `loopGuardPlugin` cuts it | — | — | No |
| Test a flow | [`createTraceRecorder`](tracing.md#keep-the-last-events-for-an-incident) | [Marble tests](https://rxjs.dev/guide/testing/marble-testing) | `fork` gives an isolated scope | You wire it yourself |

A dash means that this page does not compare it. Read the table as a map of where to look, not as a score. Effector and RxJS also hold state and streams, which nanoeffects does not, so their tools cover more ground. nanoeffects covers one thing in depth: why an async handler ran, and why it stopped.

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

- **No browser extension or UI of its own.** Use [Redux DevTools](tracing.md#configure-redux-devtools), the console or the Performance panel. Effector has an inspector for this.
- **No map from the source code.** `describeBus` lists the listeners registered so far, and `graphLogger` shows the events that happened. A listener that is not registered yet is not on the map.
- **No click-through from the log to the code.** With `tracePlugin({ source: true })` an event carries the `file:line:column` of its listener ([Find the line of a listener](tracing.md#find-the-line-of-a-listener)), but a link in a UI is yours to build.
- **No names from a compiler.** Function names give a name for free; a minifier can shorten them, so use `traceId` where a name must stay stable.
- **No replay and no time travel.** The recorder keeps what happened and cannot run it again.
