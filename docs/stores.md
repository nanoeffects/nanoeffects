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

## Emit from Zustand

No adapter: the store notifies, you `emit` onto a normal bus.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // plain bus; no Redux middleware

const stop = store.subscribe((state, previous) => {
  if (state.user === previous.user) return;
  bus.emit("user/changed", state.user);
});

// latest — drop in-flight sync when the user changes again
bus.on(
  "user/changed",
  latest(async (user, { signal }) => {
    await sync(user, { signal });
  }),
);
```

## Emit from MobX

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { reaction } from "mobx";

const bus = createBus();

const stop = reaction(
  () => store.user,
  (user) => bus.emit("user/changed", user),
);

bus.on(
  "user/changed",
  latest(async (user, { signal }) => {
    await sync(user, { signal });
  }),
);
```

Stop watching with what the store returned: `onAbort(ctx, stop)` inside a task, or `m.signal.addEventListener("abort", stop)` in a module.

The other way: give the store to tasks with `createBus({ context: { store } })`, and change it from a handler (`setState`, MobX action). A handler that changes the value it was started by emits again, so watch the smallest slice. For a MobX `flow`, `onAbort(ctx, () => promise.cancel())` cancels it with the task.
