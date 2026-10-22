# Turn events into Observables

Use this page only when you already work in Observables / RxJS. Prefer `bus.on` with policies for cancellation and tracing.

`createObserve(bus)` from `nanoeffects/observable` turns a bus event into an Observable that follows the TC39 proposal (`subscribe`, `unsubscribe`, `Symbol.observable`). RxJS and other stream libraries take it as it is. Nothing here depends on them.

<!-- docs-check: skip - needs rxjs, which the project does not depend on -->
```js
import { from } from "rxjs";
import { debounceTime, distinctUntilChanged, switchMap } from "rxjs/operators";
import { createObserve } from "nanoeffects/observable";

const observe = createObserve(bus); // Observable per event name

from(observe("typed"))
  .pipe(debounceTime(300), distinctUntilChanged(), switchMap(searchRequest))
  .subscribe((items) => bus.emit("results", items));
```

- `observe(event)` returns an Observable of the payloads of that event. Each `subscribe` is a `bus.on` of its own; `unsubscribe()` removes it.
- `subscribe` takes a function or an object with `next`.
- The stream never completes and never fails: events are the only thing that arrives. Errors of the subscriber’s handler belong to the subscriber.
- A subscription made this way is not tied to a task. End it yourself: `onAbort(ctx, subscription.unsubscribe)` inside a task, or with the signal of a module.
- For cancellation, policies, and tracing, keep to `bus.on` with `latest`, `debounce`, `queue` — they know about tasks. The Observable is for places where a stream is already how you work.
