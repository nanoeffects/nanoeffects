# Coming from mitt, nanoevents or EventEmitter

Read this page if your app uses a small event emitter (`mitt`, `nanoevents`, Node's `EventEmitter`, `tiny-emitter`) and its handlers start to do async work: requests, timers, retries. It maps the calls, shows what you gain, and shows what to check before you switch.

## When to switch

An emitter calls a function and forgets it. That is enough while handlers are synchronous. Switch when handlers start async work and you hit one of these:

- an older request finishes after a newer one and overwrites its result;
- you keep `AbortController` objects by hand;
- you write debounce, throttle or retry around handlers yourself;
- you cannot tell which event started which request.

If handlers stay synchronous, keep your emitter. nanoeffects costs about 1.3 kB gzip, close to the small emitters.

## Find the equivalent

| mitt / EventEmitter | nanoeffects |
| ------------------- | ----------- |
| `emitter.on("a", handler)` | `bus.on("a", handler)` |
| `emitter.off("a", handler)` | call the function that `bus.on` returned, or `bus.off("a")` for all handlers of `a` |
| `emitter.emit("a", payload)` | `bus.emit("a", payload)` |
| `emitter.once("a", handler)` | `bus.once("a", handler)` |
| `on("*", (type, payload) => …)` | `bus.on("*", (payload, ctx) => …)`: the event name is `ctx.type` (see the [Guide](guide.md)) |
| `emitter.all.clear()` | `bus.off()` |

Two differences to know:

- `bus.on` returns the unsubscribe function. You do not need to keep the handler to remove it.
- The handler gets a second argument, the task context: `(payload, ctx)`. You can ignore it until you need `ctx.signal` or `ctx.emit`.

## Move a handler

Before, with `mitt`:

<!-- docs-check: skip - needs mitt, which the project does not depend on -->
```js
import mitt from "mitt";

const emitter = mitt();

emitter.on("search", async (query) => {
  const items = await api.search(query);
  emitter.emit("results", items);
});

emitter.emit("search", "abc");
```

After, with nanoeffects. The first step changes only the import and the constructor:

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // event bus; each handler call is a task

bus.on("search", async (query) => {
  const items = await api.search(query);
  bus.emit("results", items);
});

bus.emit("search", "abc");
```

The second step fixes the race. Wrap the handler in `latest` and pass the signal to the request:

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // event bus; each handler call is a task

// latest: a newer "search" aborts the older run
bus.on(
  "search",
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal }); // signal cancels the request
    bus.emit("results", items);
  }),
);

bus.emit("search", "abc");
```

More cases (pause, retry, timeout): [Cancel stale requests](cancel-stale-requests.md).

## Check the differences

| Topic | Emitter | nanoeffects |
| ----- | ------- | ----------- |
| Handler order | order of subscription | order of subscription |
| Error in a handler | depends on the library | the first error stops the rest and is thrown from `emit`; set `onError` to isolate handlers ([Errors](errors.md)) |
| Async handler rejects | usually an unhandled rejection | not handled without `onError`; set `onError` to catch it |
| Event without a listener | ignored | ignored; set `onUnhandled` to be told |
| Types | event map in a type parameter | event map in a type parameter ([TypeScript](typescript.md)) |

The exact rules of `emit`, abort and ordering: [Semantics](semantics.md).
