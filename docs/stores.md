# Connect Redux, Zustand, MobX, or Pinia

Use this page when you **already have a store** and want async work with cancellation and policies next to it. It is not a reason to pick Redux (or any store).

If you do not have a store yet, use `createBus` from the [Guide](guide.md).

## On this page

- [Wire Redux Toolkit to a bus](#wire-redux-toolkit-to-a-bus)
- [Emit from a state manager](#emit-from-a-state-manager)
  - [Nanostores](#nanostores)
  - [MobX](#mobx)
  - [Valtio](#valtio)
  - [Jotai](#jotai)
  - [Zustand](#zustand)
  - [Pinia](#pinia)
  - [Callbacks on every change](#callbacks-on-every-change)
  - [Stop watching a store](#stop-watching-a-store)
  - [Give the store to every handler](#give-the-store-to-every-handler)

## Wire Redux Toolkit to a bus

Redux’s `dispatch` → reducers updates **state**. It does not give you first-class **tasks** (abort in-flight work, `latest` / `debounce` / `queue`, `retry` / `timeout`). People usually reach for thunks, RTK listener middleware, or sagas for that.

`createEffectsMiddleware(bus)` does the same job: after the reducer runs, the action also hits the nanoeffects bus you pass to it. Keep RTK for state; use policies and effects for async.

Skip this section if you are not already on Redux. The recipe as a file, type-checked with the project: [`examples/redux.ts`](../examples/redux.ts).

```js
import { configureStore, createAction } from "@reduxjs/toolkit";
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { createEffectsMiddleware } from "nanoeffects/redux";

const userRequested = createAction("user/requested"); // RTK
const userLoaded = createAction("user/loaded");

const bus = createBus(); // the bus of your app; it can exist before the store

// createEffectsMiddleware — actions reach the bus after reducers; tasks get ctx.store
const effects = createEffectsMiddleware(bus);

const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(effects),
});

// latest — a newer run aborts the older one
bus.on(
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
- **A failing handler does not break `dispatch`.** With `onError` on the bus, the bus isolates the handlers. Without it the error goes to `console.error`, as in RTK listeners. Reducers still throw to the caller.
- **`store` reaches tasks when the middleware is installed**, even though the bus is created before `configureStore`.

The only option is `filter`, which keeps rejected actions away from the bus. Options of the bus (`onError`, `context`, `trace`) go to `createBus`. Use one bus for one store. Values that are not plain actions (thunks) go through untouched. Nothing here depends on the `redux` package at runtime.

### Type `ctx.store` (optional)

Only if you want TypeScript to know `store` on handlers. **Skip this in JavaScript** — the middleware already puts `store` on the task at runtime. These lines do not connect the store across the app.

```ts
import { createBus, type WithContext } from "nanoeffects";
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

const bus = createBus<Events>(); // the event map types ctx.store
const effects = createEffectsMiddleware(bus);
```

## Emit from a state manager

Zustand, MobX, Jotai, Valtio, Nanostores and Pinia have no adapter. Redux is different: use the middleware from the first section, it sends actions to the bus. A plain store works with the bus in two directions, and both are shown for each store below:

- **The store triggers an event.** The store tells you about a change with a callback. You pass that callback `bus.emitter(action)`, and the change becomes an event that starts a handler.
- **The event changes the store.** The handler reports its result as an event. A listener of the bus writes it into the store.

The example is a search box. The store holds two fields: `query`, which the user types, and `results`, which a request fills. A change of `query` starts a debounced search; the search ends with an event that writes `results`.

Writing `(query) => bus.emit(queryChanged(query))` for every subscription repeats the bus and the action. `emitterPlugin` adds `bus.emitter(action)`: it returns that callback for you. The action stays a plain `createAction`, so `bus.emit(queryChanged("nano"))` and `bus.on(queryChanged, …)` work as before.

The bus is the same for every store below. Create it once; each subsection imports it.

```js
// search-bus.js
import { createBus } from "nanoeffects";
import { createAction, emitterPlugin } from "nanoeffects/actions";
import { debounce, latest } from "nanoeffects/policies";

export const bus = createBus().use(emitterPlugin()); // adds bus.emitter; returns the same bus

// createAction — plain action creators; calling one only builds { type, payload }
export const queryChanged = createAction("search/queryChanged");
export const searchLoaded = createAction("search/loaded");

// bus.emitter: a callback (query) => bus.emit(queryChanged(query))
export const emitQueryChanged = bus.emitter(queryChanged);

// debounce — wait 300 ms of quiet; latest — abort the search of the previous query
bus.on(
  queryChanged,
  debounce(
    300,
    latest(async (query, ctx) => {
      // api — your client; ctx.signal lets latest cancel the request itself
      const items = await api.search(query, { signal: ctx.signal });
      ctx.emit(searchLoaded(items)); // report the result as an event
    }),
  ),
);
```

Write `results` and never the field you watch: a handler that changed `query` would start itself again. Find your store below.

### Nanostores

`listen` calls back with the new value. `subscribe` would also call at once, with the current value, so use `listen`.

```js
import { atom } from "nanostores";
import { bus, emitQueryChanged, searchLoaded } from "./search-bus";

const $query = atom("");
const $results = atom([]);

// store → bus: listen calls back with the new query on every change
const stopQuery = $query.listen(emitQueryChanged);

// bus → store: bus.on returns the function that removes this listener
const stopResults = bus.on(searchLoaded, (items) => {
  $results.set(items);
});
```

### MobX

`reaction` watches an expression and calls back with its value. Change observables inside `runInAction`.

```js
import { observable, reaction, runInAction } from "mobx";
import { bus, emitQueryChanged, searchLoaded } from "./search-bus";

const search = observable({ query: "", results: [] });

// store → bus: reaction watches the expression and calls back with its value
const stopQuery = reaction(() => search.query, emitQueryChanged);

// bus → store: bus.on returns the function that removes this listener
const stopResults = bus.on(searchLoaded, (items) => {
  runInAction(() => {
    search.results = items;
  });
});
```

### Valtio

`subscribeKey` watches one field of a proxy state. Assign to the proxy to change it.

```js
import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";
import { bus, emitQueryChanged, searchLoaded } from "./search-bus";

const state = proxy({ query: "", results: [] });

// store → bus: subscribeKey watches one field
const stopQuery = subscribeKey(state, "query", emitQueryChanged);

// bus → store: bus.on returns the function that removes this listener
const stopResults = bus.on(searchLoaded, (items) => {
  state.results = items;
});
```

### Jotai

`sub` gives no value, so read it yourself. Write with `store.set`.

```js
import { atom, createStore } from "jotai";
import { bus, emitQueryChanged, searchLoaded } from "./search-bus";

const queryAtom = atom("");
const resultsAtom = atom([]);
const store = createStore();

// store → bus: sub calls back without a value; store.get reads it
const stopQuery = store.sub(queryAtom, () => emitQueryChanged(store.get(queryAtom)));

// bus → store: bus.on returns the function that removes this listener
const stopResults = bus.on(searchLoaded, (items) => {
  store.set(resultsAtom, items);
});
```

### Zustand

With `subscribeWithSelector` the selector picks the field, and the callback is called only when it changes. Without a selector Zustand calls back on every `setState`, with the whole state.

```js
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { bus, emitQueryChanged, searchLoaded } from "./search-bus";

const useSearchStore = create(
  subscribeWithSelector(() => ({ query: "", results: [] })),
);

// store → bus: subscribe with a selector calls back with state.query only when it changes
const stopQuery = useSearchStore.subscribe((state) => state.query, emitQueryChanged);

// bus → store: bus.on returns the function that removes this listener
const stopResults = bus.on(searchLoaded, (items) => {
  useSearchStore.setState({ results: items });
});
```

### Pinia

Pinia (the store of Vue) keeps reactive objects, and its `$subscribe` reports every mutation of the store, not one field. Watch one getter with Vue's `watch` instead: it calls back with the new value. Assign to the store to change it.

```js
import { watch } from "vue";
import { defineStore } from "pinia";
import { bus, emitQueryChanged, searchLoaded } from "./search-bus";

// defineStore — Pinia: the state of one store
const useSearch = defineStore("search", {
  state: () => ({ query: "", results: [] }),
});

const search = useSearch(); // call it after the app has installed Pinia

// store → bus: watch calls back with the new query when search.query changes
const stopQuery = watch(() => search.query, emitQueryChanged);

// bus → store: bus.on returns the function that removes this listener
const stopResults = bus.on(searchLoaded, (items) => {
  search.results = items;
});
```

### Callbacks on every change

The stores above call back only when the value changed, so the emitter does not compare values. For a store that calls back on every change, select a smaller value first, as Zustand does above.

### Stop watching a store

Stop both directions with what the calls returned: `stopQuery` from the store and `stopResults` from `bus.on`. Call them yourself, or hand them over: `onAbort(ctx, stopQuery)` inside a task, or `m.signal.addEventListener("abort", stopQuery)` in a module.

### Give the store to every handler

Instead of a listener per store, give the store to all tasks with `createBus({ context: { store } })` ([Context fields](context.md)) and change it from any handler (`setState`, a MobX action, a Pinia store). The same rule holds: write the field you do not watch. For a MobX `flow`, `onAbort(ctx, () => promise.cancel())` cancels it with the task.
