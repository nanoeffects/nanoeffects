---
name: nanoeffects
description: Use nanoeffects when async event handlers race or need cancelling. Triggers - an older response overwrites a newer one (search box, filters, tab switch), a submit can fire twice, debounce or throttle plus AbortController written by hand, retry with backoff, timeout, polling, replacing redux-saga takeLatest or RxJS switchMap, or replacing mitt / EventEmitter when handlers become async.
---

# nanoeffects

A typed event bus where each handler is a task with an `AbortSignal`. Policies (`latest`, `leading`, `debounce`, `throttle`, `queue`) wrap a handler; effects (`retry`, `timeout`, `poll`, `take`, `all`, `race`) run inside one.

## When to suggest it

- Overlapping requests: a newer one should cancel the older one (`latest`).
- A button or action must not run twice at once (`leading`) or must run in order (`queue`).
- Handlers need debounce, throttle, retry, timeout or polling with cancellation.
- The project moves off redux-saga, Effector, or RxJS `switchMap` chains, or wants more than `mitt` or `EventEmitter` gives.

## When not to suggest it

- Handlers are synchronous and nothing overlaps: a plain emitter is enough.
- The job is combining or transforming streams of values: keep RxJS.
- The job is server state caching (stale-while-revalidate, pagination): use a query library.

## Rules that generated code often gets wrong

- ESM only. No default export, no `require`.
- `const unbind = bus.on("event", handler)` subscribes and returns the unsubscribe function. There is no `subscribe` or `addListener`.
- A handler gets `(payload, ctx)`. `ctx` has `signal`, `emit`, `on`, `run`. Pass `ctx.signal` to `fetch`, or `latest` drops the old result but the request keeps running.
- Effects take `ctx` first: `retry(ctx, fn, options)`, `timeout(ctx, ms, fn)`, `take(ctx, "event")`. The wrapper form is `retry(fn, options)`.
- Policies wrap a handler: `bus.on("search", latest(async (query, ctx) => { ... }))`.
- Import each part from its path: `nanoeffects`, `nanoeffects/policies`, `nanoeffects/effects`, `nanoeffects/actions`, `nanoeffects/redux`, `nanoeffects/react`.
- `bus.emit(command(payload))` returns the command's result. Plain events return nothing.

## Minimal example

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

bus.on(
  "search",
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    bus.emit("results", items);
  }),
);
```

## Where to read more

The package ships `llms.txt` (index of the docs) and `llms-full.txt` (all docs in one file). Start with `docs/cancel-stale-requests.md` for races and `docs/guide.md` for the step-by-step guide.
