# Put your own fields on every task

Optional: put a store, client, or logger on every task. Skip until many handlers need the same dependency.

## Pass values at runtime

```js
import { createBus } from "nanoeffects";

// createBus({ context }) — every task gets these fields
const bus = createBus({ context: { store } });

bus.on("save", (draft, { store }) => {
  store.put(draft);
});
```

That is enough in JavaScript. The fields appear on handlers, `ctx.run`, `ctx.on`, commands, modules, and child tasks of effects and policies.

Library fields (`signal`, `emit`, `run`, …) win on name clashes. `context` may be a function `(task) => fields` when the value depends on the task.

## Type the fields (optional)

`WithContext` on the event map only tells TypeScript that handlers of **this** bus have those fields. It does not wire anything at runtime and is not app-wide — another bus can have different fields or none.

```ts
import { createBus, type WithContext } from "nanoeffects";

// Events — event name → payload
// WithContext — checker-only: handlers also have ctx.store
type Events = { save: Draft } & WithContext<{ store: Store }>;

const bus = createBus<Events>({ context: { store } });
```
