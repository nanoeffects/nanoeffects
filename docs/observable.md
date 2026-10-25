# Turn events into Observables

Use this page when your app already works with Observables or RxJS and you want a bus event as a stream. If you start from scratch, prefer `bus.on` with policies: they cancel work and show up in traces.

`createObserve(bus)` from `nanoeffects/observable` turns a bus event into an Observable that follows the TC39 proposal (`subscribe`, `unsubscribe`, `Symbol.observable`). RxJS and other stream libraries take it as it is. Nothing here depends on them.

## Turn an event into a stream

Problem: a search box emits `typed` on every key. You want to wait for a pause and skip repeats with operators you already know.

<!-- docs-check: skip - needs rxjs, which the project does not depend on -->
```js
import { createBus } from "nanoeffects";
import { createObserve } from "nanoeffects/observable";
import { from } from "rxjs";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";

const bus = createBus(); // the bus: events and handlers
const observe = createObserve(bus); // observe(event) gives an Observable per event name

const typed$ = from(observe("typed")); // RxJS wraps it with from()

const subscription = typed$
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((query) => bus.emit("search", query)); // back into the bus
```

- `observe(event)` returns an Observable of the payloads of that event. Each `subscribe` is a `bus.on` of its own; `unsubscribe()` removes it.
- `subscribe` takes a function or an object with `next`.
- Types follow the event map: `observe("typed")` is an `Observable<string>` when `typed` carries a string.

## Send a stream into the bus

Problem: `.subscribe((value) => bus.emit(action(value)))` repeats the bus and the action in every subscription. `bus.emitter(action)` from `emitterPlugin` returns that callback, so it is the argument of `subscribe`. It works with any source that takes a `next` function: an RxJS stream, a store callback, a DOM listener.

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // adds bus.emitter
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("search/queryChanged"); // a plain action creator
```

<!-- docs-check: skip - needs rxjs, which the project does not depend on -->
```js
import { fromEvent } from "rxjs";
import { debounceTime, distinctUntilChanged, map } from "rxjs/operators";
import { bus } from "./bus";
import { queryChanged } from "./search";

const input = document.querySelector("#search"); // the search box

const subscription = fromEvent(input, "input")
  .pipe(
    map((event) => event.target.value),
    debounceTime(300),
    distinctUntilChanged(),
  )
  .subscribe(bus.emitter(queryChanged)); // calls bus.emit(queryChanged(value))

bus.on(queryChanged, (query) => console.log("search for", query));
```

The Observable can come from anywhere, not only from `createObserve`. `subscription.unsubscribe()` stops it; the bus does not know about it. Pass the callback to `subscribe` as it is, and do not call `bus.emitter(...)` inside the operators on every value.

## Do the work in a handler, not in `switchMap`

An Observable is good for shaping values. A request is better in a handler with a policy, because the handler has a `signal` and the trace shows it. Split it: RxJS ends at the value, the bus starts the work.

<!-- docs-check: skip - needs rxjs, which the project does not depend on -->
```js
import { latest } from "nanoeffects/policies";

// RxJS: shape the values (debounce, skip repeats), then hand them to the bus
from(observe("typed"))
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe((query) => bus.emit("search", query));

// nanoeffects: one cancellable request; a newer "search" aborts the old one
bus.on(
  "search",
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    bus.emit("results", items);
  }),
);
```

`switchMap` drops the old inner stream. `latest` aborts the old task through `signal`, so a `fetch` that got the signal really stops.

## Convert back to a stream or a promise

| You need | Write |
| -------- | ----- |
| A stream of events, with operators | `from(observe("event"))` |
| The next event as a promise | `firstValueFrom(from(observe("event")))`; inside a task `take(ctx, "event")` does the same and respects abort |
| The events of a bus as an RxJS `Observable` class (for `instanceof` or `pipe` as a method) | `new Observable((subscriber) => observe("event").subscribe(subscriber))` |
| A task's abort as a stream | `fromEvent(ctx.signal, "abort")`, for `takeUntil` |
| The latest value to new subscribers | `from(observe("event")).pipe(shareReplay(1))`; the Observable replays nothing by itself |

Events that fired before `subscribe` are lost: the Observable is hot, like `bus.on`. Add `startWith(initial)` or `shareReplay` when a late subscriber needs a value.

## End the subscription

A subscription from `observe` is not tied to a task. Nothing ends it for you. Pick one:

<!-- docs-check: skip - needs rxjs, which the project does not depend on -->
```js
import { fromEvent, from } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { onAbort } from "nanoeffects/effects";

bus.on("screen-opened", (_, ctx) => {
  // takeUntil: stop the stream when the task aborts
  from(observe("typed"))
    .pipe(takeUntil(fromEvent(ctx.signal, "abort")))
    .subscribe((query) => bus.emit("search", query));

  // or: onAbort calls unsubscribe for you
  const subscription = observe("scrolled").subscribe(updatePosition);
  onAbort(ctx, subscription.unsubscribe);
});
```

Outside a task, call `subscription.unsubscribe()` yourself when the screen goes away, or use the signal of a module.

## Know the limits

- The stream never completes and never fails: events are the only thing that arrives. An error thrown by your subscriber is yours; the bus handles it only if `onError` is set ([Errors](errors.md)).
- `observe` reads the bus when you call `subscribe`, not when you create it. Create it once, call it as often as needed.
- Operators that keep state (`scan`, `buffer`, `window`) live in RxJS. The bus keeps no values. For the full split of work see [Use nanoeffects next to RxJS](migrating-from-rxjs.md).
