# Connect Redux, Zustand, or MobX

Use this page when you **already have a store** and want async work with cancellation and policies next to it. It is not a reason to pick Redux (or any store).

If you do not have a store yet, use `createBus` from the [Guide](guide.md). Recipe: [`examples/redux.ts`](../examples/redux.ts).

## Wire Redux Toolkit to a bus

Redux’s `dispatch` → reducers updates **state**. It does not give you first-class **tasks** (abort in-flight work, `latest` / `debounce` / `queue`, `retry` / `timeout`). People usually reach for thunks, RTK listener middleware, or sagas for that.

`createEffectsMiddleware` does the same job: after the reducer runs, the action also hits a nanoeffects bus. Keep RTK for state; use policies and effects for async.

Skip this section if you are not already on Redux.

```js
import { configureStore, createAction } from "@reduxjs/toolkit";
import { createEffectsMiddleware } from "nanoeffects/redux";
import { latest } from "nanoeffects/policies";

const userRequested = createAction("user/requested"); // RTK
const userLoaded = createAction("user/loaded");

// bus + middleware: actions reach the bus after reducers; tasks get ctx.store
const effects = createEffectsMiddleware();

const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(effects.middleware),
});

// latest — a newer run aborts the older one
effects.bus.on(
  userRequested,
  latest(async (id, { store, signal }) => {
    const user = await fetchUser(id, { signal });
    store.dispatch(userLoaded(user));
  }),
);
```

String event names (`"user/requested"`) work the same. Use your usual RTK actions (`createSlice` / `createAction`). nanoeffects adds the middleware and policies; it does not replace RTK actions.

### What the middleware guarantees

- **No self-loop.** An action that a handler dispatches through `ctx.store` and that has the type the handler works on does not go back to the bus. Other handlers of that type do not get it either. Longer cycles (`a` → `b` → `a`) are yours to avoid.
- **A failing handler does not break `dispatch`.** Errors go to `onError` (default `console.error`), as in RTK listeners. Reducers still throw to the caller.
- **`store` reaches tasks when the middleware is installed**, even though the bus is created before `configureStore`.

Options are those of `createBus` (except `context`, which adds fields next to `store`) and `filter`, which keeps rejected actions away from the bus. Values that are not plain actions (thunks) go through untouched. Nothing here depends on the `redux` package at runtime.

### Type `ctx.store` (optional)

Only if you want TypeScript to know `store` on handlers. **Skip this in JavaScript** — the middleware already puts `store` on the task at runtime. These lines do not connect the store across the app.

```ts
import type { WithContext } from "nanoeffects";
import {
  createEffectsMiddleware,
  type ReduxStoreApi,
} from "nanoeffects/redux";

// RootState — your Redux state shape (for getState)
type RootState = { user: string | null };

// Events — event name → payload for this bus
// WithContext — checker-only: handlers also have ctx.store
type Events = {
  "user/requested": string;
} & WithContext<{ store: ReduxStoreApi<RootState> }>;

const effects = createEffectsMiddleware<Events>();
```

## Emit from a state manager

Zustand, MobX, Jotai, Valtio and Nanostores have no adapter. Each store tells you about a change with a callback, and you turn that call into an event of a normal bus.

Writing `(name) => bus.emit(nameChanged(name))` for every subscription repeats the bus and the action. `emitterPlugin` adds `bus.emitter(action)`: it returns that callback for you. The action stays a plain `createAction`, so `bus.emit(nameChanged("Eva"))` and `bus.on(nameChanged, …)` work as before.

```js
import { createBus } from "nanoeffects";
import { createAction, emitterPlugin } from "nanoeffects/actions";
import { latest } from "nanoeffects/policies";

const bus = createBus().use(emitterPlugin()); // adds bus.emitter; returns the same bus

const nameChanged = createAction("name/changed"); // a plain action creator

// bus.emitter: a callback (name) => bus.emit(nameChanged(name))
const emitNameChanged = bus.emitter(nameChanged);

// latest — drop the request in flight when the name changes again
bus.on(
  nameChanged,
  latest(async (name, { signal }) => {
    await saveName(name, { signal });
  }),
);
```

Pass `emitNameChanged` to the subscription of your store. It sends the first argument of the call as the payload.

```js
// Nanostores: listen calls back with the new value (subscribe would call at once)
const stop = $name.listen(emitNameChanged);

// MobX: reaction watches the expression and calls back with its value
const stop = reaction(() => user.name, emitNameChanged);

// Valtio: subscribeKey watches one field
const stop = subscribeKey(state, "name", emitNameChanged);

// Jotai: sub gives no value, read it yourself
const stop = store.sub(nameAtom, () => emitNameChanged(store.get(nameAtom)));

// Zustand with subscribeWithSelector: the selector picks the field, and the
// callback is called only when it changes. Without a selector Zustand calls back
// on every setState, with the whole state.
const stop = store.subscribe((state) => state.name, emitNameChanged);
```

These stores call back only when the value changed, so the emitter does not compare values. For a store that calls back on every change, select a smaller value first, as Zustand does above.

Redux is different: use the middleware from the first section, it sends actions to the bus.

Stop watching with what the store returned: `onAbort(ctx, stop)` inside a task, or `m.signal.addEventListener("abort", stop)` in a module.

The other way: give the store to tasks with `createBus({ context: { store } })`, and change it from a handler (`setState`, MobX action). A handler that changes the value it was started by emits again, so watch the smallest slice. For a MobX `flow`, `onAbort(ctx, () => promise.cancel())` cancels it with the task.
