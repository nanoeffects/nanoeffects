# Use nanoeffects next to RxJS

Read this page if your project uses RxJS and you wonder what nanoeffects takes over. It does not replace RxJS. The two split the work: RxJS shapes streams of values, nanoeffects runs the side effects that events start. It maps the operators, shows one search box both ways, and lists what stays in RxJS.

## Split the work

| Job | Use |
| --- | --- |
| Start a request when something happens, cancel it when a newer one arrives, retry it, time it out | nanoeffects |
| Know which task started which, log and trace it | nanoeffects ([Tracing](tracing.md)) |
| Combine several streams, keep a running value, buffer, window, merge over time | RxJS |
| Work with a stream as a value (`map`, `scan`, `combineLatest`) | RxJS |

A handler in nanoeffects is one function per event. A pipeline in RxJS is a chain of operators over a stream. If your pipeline is a few operators that end in `switchMap` and a request, it fits a handler with a policy and is shorter. If it combines streams, it stays.

## Find the equivalent

| RxJS | nanoeffects |
| ---- | ----------- |
| `mergeMap` | `bus.on(event, handler)`: every event starts a task |
| `switchMap` | [`latest`](policies.md) |
| `exhaustMap` | [`leading`](policies.md) |
| `concatMap` | [`queue`](policies.md) |
| `debounceTime` | [`debounce`](policies.md) |
| `throttleTime` | [`throttle`](policies.md) |
| `groupBy` + `switchMap` | `latest(handler, { key })` |
| `retry`, `retryWhen` | [`retry`, `backoff`](effects.md) |
| `timeout` | [`timeout`](effects.md) |
| `interval` + `switchMap` | [`poll`](effects.md) |
| `takeUntil(stop$)` | `ctx.signal`, and [`take`](effects.md) to wait for the stop event |
| `forkJoin` | [`all`](effects.md) |
| `race` | [`race`](effects.md) |
| `firstValueFrom(fromEvent(…))` | [`take(ctx, event)`](effects.md) |
| `Subject` | `bus.emit` and `bus.on` |
| `map`, `filter`, `scan`, `combineLatest`, `buffer`, `window`, `share` | stay in RxJS |
| `distinctUntilChanged` | a check in the handler, or in the store subscription (see [Stores](stores.md)) |

A policy and an operator differ in one thing. `switchMap` drops the old inner stream. `latest` aborts the old task through its `signal`, so a `fetch` that got the signal stops. Pass the signal on, or the work goes on in the background.

## Rewrite a search box

The same job in RxJS: wait for a pause, skip repeats, cancel the old request.

<!-- docs-check: skip - needs rxjs, which the project does not depend on -->
```js
// RxJS
import { fromEvent } from "rxjs";
import { debounceTime, distinctUntilChanged, map, switchMap } from "rxjs/operators";

fromEvent(input, "input")
  .pipe(
    map((event) => event.target.value),
    debounceTime(300),
    distinctUntilChanged(),
    switchMap((query) => api.searchStream(query)),
  )
  .subscribe((items) => render(items));
```

The same job in nanoeffects:

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

// latest: a newer search aborts the request in flight
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  bus.emit("results", items);
});

// debounce: run after 300 ms without a new "typed"
bus.on("typed", debounce(300, searchLatest));

bus.on("results", (items) => render(items));

const input = document.querySelector("#search"); // the search box
input.addEventListener("input", (event) => bus.emit("typed", event.target.value));
```

The skip of repeated values is not here. Add `if (query === lastQuery) return;` to the handler, or keep that one step in RxJS (next section).

## Use both in one app

Keep RxJS where a stream is how you think, and let events cross to the bus in either direction.

**Bus to RxJS.** `createObserve(bus)` gives an Observable of an event ([Observables](observable.md)).

**RxJS to bus.** `bus.emitter(action)` returns a callback that emits the action, so it is the argument of `subscribe` ([Stores](stores.md) has the plugin).

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // adds bus.emitter
```

```js
// filters.js
import { createAction } from "nanoeffects/actions";

export const filtersChanged = createAction("filters/changed"); // a plain action creator
```

<!-- docs-check: skip - needs rxjs, which the project does not depend on -->
```js
import { combineLatest } from "rxjs";
import { latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { filtersChanged } from "./filters";

// RxJS: combine two streams into one value; nanoeffects does not do that
const subscription = combineLatest([query$, category$]).subscribe(
  bus.emitter(filtersChanged), // calls bus.emit(filtersChanged(value))
);

// nanoeffects: one cancellable request per change of the filters
bus.on(
  filtersChanged,
  latest(async ([query, category], { signal }) => {
    const items = await api.search(query, category, { signal });
    bus.emit("results", items);
  }),
);
```

The subscription is not tied to a task. Call `subscription.unsubscribe()` when the screen goes away.

## What is different

- **No streams of values.** A handler gets one payload and runs a task. There is no `pipe`, no operator for the values that follow.
- **Abort replaces unsubscribe for work in flight.** A stopped task is stopped through its `signal`. Pass it to `fetch` or to the client.
- **Errors are not part of the stream.** A failed task rejects its own promise. Without `onError` on the bus nobody else hears it ([Errors](errors.md)).
- **No completion.** An event bus does not end. A task ends when its work ends or its signal aborts.
- **No marble tests.** Test with the real handler and fake timers.
