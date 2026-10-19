# Observable: events as streams

`createObserve(bus)` from `nanoeffects/observable` turns an event of the bus into an Observable that follows the TC39 proposal (`subscribe`, `unsubscribe`, `Symbol.observable`). RxJS and other stream libraries take it as it is, and nothing here depends on them.

```ts
import { from } from "rxjs";
import { debounceTime, distinctUntilChanged, switchMap } from "rxjs/operators";
import { createObserve } from "nanoeffects/observable";

const observe = createObserve(bus);

// events of the bus as a stream
from(observe("typed"))
  .pipe(debounceTime(300), distinctUntilChanged(), switchMap(searchRequest))
  .subscribe((items) => bus.emit("results", items));
```

- `observe(event)` returns an Observable of the payloads of that event. Each `subscribe` is a `bus.on` of its own, and `unsubscribe()` removes it.
- `subscribe` takes a function or an object with `next`.
- The stream never completes and never fails: events are the only thing that arrives. Errors of the handler of the subscriber belong to the subscriber.
- A subscription made this way is not tied to a task, so end it yourself: `onAbort(ctx, subscription.unsubscribe)` inside a task, or with the signal of a module.
- For cancellation, policies and tracing keep to `bus.on` with `latest`, `debounce`, `queue`: they know about tasks. The Observable is for the places where a stream is already the way you work.
