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
  - [React: sharing a value across components](#react-sharing-a-value-across-components)
  - [Callbacks on every change](#callbacks-on-every-change)
  - [Stop watching a store](#stop-watching-a-store)
  - [Give the store to every handler](#give-the-store-to-every-handler)

## Wire Redux Toolkit to a bus

Redux’s `dispatch` → reducers updates **state**. It does not give you first-class **tasks** (abort in-flight work, `latest` / `debounce` / `queue`, `retry` / `timeout`). People usually reach for thunks, RTK listener middleware, or sagas for that.

`createEffectsMiddleware(bus)` does the same job: after the reducer runs, the action also hits the nanoeffects bus you pass to it. Keep RTK for state; use policies and effects for async.

Skip this section if you are not already on Redux. The recipe as a file, type-checked with the project: [`examples/redux.ts`](../examples/redux.ts).

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // the bus of your app; it can exist before the store
```

```js
// user.js
import { createAction } from "@reduxjs/toolkit";

export const userRequested = createAction("user/requested"); // RTK
export const userLoaded = createAction("user/loaded");
```

```js
// store.js
import { configureStore } from "@reduxjs/toolkit";
import { createEffectsMiddleware } from "nanoeffects/redux";
import { bus } from "./bus";

// createEffectsMiddleware — actions reach the bus after reducers; tasks get ctx.store
const effects = createEffectsMiddleware(bus);

export const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(effects),
});
```

```js
// user-handlers.js
import { latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { userLoaded, userRequested } from "./user";

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

The bus, the events and the handlers are the same for every store below, each in a file of its own: the bus knows no events, and the events know no bus. Each subsection imports them.

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // adds bus.emitter; returns the same bus
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

// createAction — plain action creators; calling one only builds { type, payload }
export const queryChanged = createAction("search/queryChanged");
export const searchLoaded = createAction("search/loaded");
```

```js
// search-handlers.js
import { debounce, latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

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
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// bus.emitter: a callback (query) => bus.emit(queryChanged(query))
const emitQueryChanged = bus.emitter(queryChanged);

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
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// bus.emitter: a callback (query) => bus.emit(queryChanged(query))
const emitQueryChanged = bus.emitter(queryChanged);

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
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// bus.emitter: a callback (query) => bus.emit(queryChanged(query))
const emitQueryChanged = bus.emitter(queryChanged);

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
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// bus.emitter: a callback (query) => bus.emit(queryChanged(query))
const emitQueryChanged = bus.emitter(queryChanged);

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
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// bus.emitter: a callback (query) => bus.emit(queryChanged(query))
const emitQueryChanged = bus.emitter(queryChanged);

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
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// bus.emitter: a callback (query) => bus.emit(queryChanged(query))
const emitQueryChanged = bus.emitter(queryChanged);

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

### React: sharing a value across components

<!-- docs-check: new -->

A value of your UI (a query, a filter, a name) often has two jobs. Several components read it and re-render when it changes, and the bus must hear about each change to start a handler. The recipes below differ in where the value lives. Pick the first one unless a handler must read the value.

| The value lives in | Use when |
| --- | --- |
| A Context provider with `useState` | Only components read it. Plain React, one `useEmitter` call. |
| A small store on `useSyncExternalStore` | A bus handler, a test or a timer must read it too. |
| An atom of a store library | You already use Nanostores, Jotai and the like. |

#### Plain React: Context and `useEmitter`

Writing `useEffect(() => bus.emit(...), [value])` looks enough, but it emits on mount, emits twice on mount under StrictMode, and re-runs when the emit function is new on every render. `useEmitter` from `nanoeffects/react` avoids all three. It emits after a render commits with a changed value, never on mount, and compares with `Object.is`. You need React 18 or newer; no other entry of the package uses React.

First the bus, the events and the handlers, each in its own file. `reactPlugin()` adds `bus.useEmitter`, and destructuring it gives a plain hook that you export from the bus file:

```js
// bus.js
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

export const bus = createBus().use(reactPlugin()); // the bus; reactPlugin adds bus.useEmitter
export const { useEmitter } = bus; // a free hook: it does not read `this`
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
export const searchLoaded = createAction("search/loaded");
```

```js
// search-handlers.js
import { debounce, latest } from "nanoeffects/policies";
import { bus } from "./bus";
import { queryChanged, searchLoaded } from "./search";

// debounce — wait 300 ms of quiet; latest — a newer query aborts the older request
bus.on(
  queryChanged,
  debounce(
    300,
    latest(async (query, ctx) => {
      const items = await api.search(query, { signal: ctx.signal });
      ctx.emit(searchLoaded(items)); // the result goes back to the bus as an event
    }),
  ),
);
```

Then the provider. It holds the state, calls `useEmitter` once, and listens for the result. Every component below it only reads the context:

```jsx
// SearchProvider.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { bus, useEmitter } from "./bus";
import { queryChanged, searchLoaded } from "./search";

const SearchContext = createContext(null);

export function SearchProvider({ children }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);

  // React → bus: emits queryChanged(query) after every change of query, not on mount
  useEmitter(queryChanged, query);

  // bus → React: bus.on returns the unsubscribe function, which the effect returns
  useEffect(() => bus.on(searchLoaded, setItems), []);

  return (
    <SearchContext.Provider value={{ query, setQuery, items }}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearch = () => useContext(SearchContext);
```

```jsx
// Search.jsx
import { useSearch } from "./SearchProvider";

// any number of components can read the same value
export function SearchBox() {
  const { query, setQuery } = useSearch();
  return <input value={query} onChange={(event) => setQuery(event.target.value)} />;
}

export function Results() {
  const { items } = useSearch();
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.title}</li>
      ))}
    </ul>
  );
}
```

Two limits to know:

- **All consumers re-render** on any change of the context value. Split it into two contexts (`query` and `items`) if that is slow.
- **A new object counts as a change.** For a value that is rebuilt with the same content, pass a third argument that says when two values are the same: `useEmitter(profileChanged, profile, (previous, next) => previous.id === next.id)`.

`useEmitter` emits after the render, not at the moment of `setQuery`. To emit on every call, even with the same value, call an emitter from the event handler (`bus.emitter(action)`, see [Zustand](#zustand)) instead.

#### A value that a handler must read

A context is not visible to a bus handler. When a handler needs the current value, keep the value outside React. About twelve lines of `useSyncExternalStore` do it, and `contextPlugin` hands it to every handler as `ctx.query`:

<!-- docs-check: new -->

```jsx
// value-store.js
import { useSyncExternalStore } from "react";

export function createValue(initial) {
  let value = initial;
  const listeners = new Set();

  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) {
        return; // no change, no notification: this also stops loops
      }
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useValue = (store) => useSyncExternalStore(store.subscribe, store.get);
```

```js
// query.js
import { createValue } from "./value-store";

export const query = createValue("");
```

```js
// bus.js
import { contextPlugin, createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";
import { query } from "./query";

// emitterPlugin adds bus.emitter; contextPlugin puts `query` on every task as ctx.query
export const bus = createBus().use(emitterPlugin()).use(contextPlugin({ query }));
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
export const refreshed = createAction("search/refreshed");
```

```js
// search-handlers.js
import { bus } from "./bus";
import { query } from "./query";
import { queryChanged, refreshed } from "./search";

// store → bus: bus.emitter turns the action into a callback; one place, any number of setters
const emitQueryChanged = bus.emitter(queryChanged);
query.subscribe(() => emitQueryChanged(query.get()));

// the handler reads the current value from ctx, whoever changed it
bus.on(refreshed, async (_payload, ctx) => {
  const items = await api.search(ctx.query.get(), { signal: ctx.signal });
  console.log(items.length);
});
```

```jsx
// SearchBox.jsx
import { query } from "./query";
import { useValue } from "./value-store";

// any number of components read and write the same value
export function SearchBox() {
  const text = useValue(query);
  return <input value={text} onChange={(event) => query.set(event.target.value)} />;
}
```

#### A store library

With Nanostores, Jotai or Zustand the value already lives outside React and has a subscription. Connect it to the bus once, as in [Nanostores](#nanostores), and read it in components with the library's own hook:

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";

export const bus = createBus().use(emitterPlugin()); // adds bus.emitter
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
```

```jsx
// SearchBox.jsx
import { atom } from "nanostores";
import { useStore } from "@nanostores/react";
import { bus } from "./bus";
import { queryChanged } from "./search";

const $query = atom("");

// listen, not subscribe: listen skips the call with the current value at start
$query.listen(bus.emitter(queryChanged));

export function SearchBox() {
  const query = useStore($query); // the hook of Nanostores; it re-renders on every change
  return <input value={query} onChange={(event) => $query.set(event.target.value)} />;
}
```

#### Do not emit inside a `useReducer` reducer

React may run a reducer more than once for one dispatch (twice in StrictMode), so a `bus.emit` inside it fires twice. Dispatch to the reducer first, then emit, from one helper. Or keep the state in a reducer and pass it to `useEmitter` like any other value.

<!-- docs-check: new -->

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus(); // the bus: created once
```

```js
// search.js
import { createAction } from "nanoeffects/actions";

export const queryChanged = createAction("query/changed");
export const queryCleared = createAction("query/cleared");
```

```jsx
// Search.jsx
import { useReducer } from "react";
import { bus } from "./bus";
import { queryChanged, queryCleared } from "./search";

function reducer(state, action) {
  if (queryChanged.match(action)) {
    return action.payload;
  }
  if (queryCleared.match(action)) {
    return "";
  }
  return state;
}

export function Search() {
  const [query, dispatch] = useReducer(reducer, "");

  // send: the reducer first, then the bus (bus.emit accepts an action)
  function send(action) {
    dispatch(action);
    bus.emit(action);
  }

  return (
    <div>
      <input value={query} onChange={(event) => send(queryChanged(event.target.value))} />
      <button type="button" onClick={() => send(queryCleared())}>
        Clear
      </button>
    </div>
  );
}
```

A plain `dispatch` skips the bus, so call `send` everywhere.

### Callbacks on every change

The stores above call back only when the value changed, so the emitter does not compare values. For a store that calls back on every change, select a smaller value first, as Zustand does above.

### Stop watching a store

Stop both directions with what the calls returned: `stopQuery` from the store and `stopResults` from `bus.on`. Call them yourself, or hand them over: `onAbort(ctx, stopQuery)` inside a task, or `m.signal.addEventListener("abort", stopQuery)` in a module.

### Give the store to every handler

Instead of a listener per store, give the store to all tasks with `createBus({ context: { store } })` ([Context fields](context.md)) and change it from any handler (`setState`, a MobX action, a Pinia store). The same rule holds: write the field you do not watch. For a MobX `flow`, `onAbort(ctx, () => promise.cancel())` cancels it with the task.
