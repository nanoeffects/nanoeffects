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

That is enough in JavaScript. The fields appear on handlers, `ctx.run`, `ctx.on`, commands, modules, and child tasks of effects and policies. For modules, use `modulePlugin` after the plugin that adds the fields: see [the order of plugins](plugins.md#follow-the-order).

Library fields (`signal`, `emit`, `run`, …) win on name clashes. `context` may be a function `(task) => fields` when the value depends on the task.

To get `race`, `all`, `take` and the like on every task without passing `ctx`, see [`effectsPlugin`](effects.md#put-selected-effects-on-ctx).

To give fields to **one** command, action, job or module, or to replace them for one `emit`, see [scopes](scope.md).

## Type the fields (optional)

In TypeScript, `contextPlugin` puts the fields on every task of **this** bus and takes their types from the value you pass. The event map holds only events. It does not wire anything across the app — another bus can have different fields or none.

```ts
import { contextPlugin, createBus } from "nanoeffects";

// Events — event name → payload
type Events = { save: Draft };

// contextPlugin — every task gets ctx.store; the type is the type of `store`
const bus = createBus<Events>().use(contextPlugin({ store }));

bus.on("save", (draft, { store }) => store.put(draft));
```

- A function `(task) => fields` makes the fields per task. It gets `{ type, payload }`.
- Several `contextPlugin` calls, `effectsPlugin` and the `context` option of `createBus` all add their fields to the same context.
- A name that the bus already has is a type error. The fields of the library (`signal`, `emit`, `run`, …) win at runtime, and a field that the context already has is not replaced.
- The plugin returns the same bus, so keep the result of the chain: `const bus = createBus().use(contextPlugin({ store }))`.

### Name the fields in the event map instead

`createBus<Events>({ context: { store } })` also types the fields, but through the event map: `WithContext` is checker-only and says which fields the handlers of this bus have. Use it when you cannot call `use`, for example for the bus that `createEffectsMiddleware` makes.

```ts
import { createBus, type WithContext } from "nanoeffects";

// WithContext — checker-only: handlers also have ctx.store
type Events = { save: Draft } & WithContext<{ store: Store }>;

const bus = createBus<Events>({ context: { store } });
```
