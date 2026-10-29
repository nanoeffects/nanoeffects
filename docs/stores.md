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
  - [Change the store from any handler](#change-the-store-from-any-handler)

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

### Show which dispatch began a chain

With a tracer and `tracePlugin` on the bus, each dispatched action reaches the bus from a root task of the trace. Name it with `traceId`, and put the flow in a group with `traceGroupId`: `createEffectsMiddleware(bus, { traceId: "store", traceGroupId: "checkout" })`. Without a `traceId` the root has the type of the action. Without the plugin the options are ignored. More in [Tracing](tracing.md#show-which-subscription-began-a-chain).

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
- **The event changes the store.** The handler reports its result as an event. A listener of the bus gets the store from `ctx` and changes it with a mutation.

The example is a search box. The store holds two fields: `query`, which the user types, and `results`, which a request fills. A change of `query` starts a debounced search; the search ends with an event that writes `results`.

Writing `(query) => bus.emit(queryChanged(query))` for every subscription repeats the bus and the action. `emitterPlugin` adds `bus.emitter(action)`: it returns that callback for you. The action stays a plain `createAction`, so `bus.emit(queryChanged("nano"))` and `bus.on(queryChanged, …)` work as before.

The bus gets the store as context: `contextPlugin({ store })` puts it on every task as `ctx.store` ([Context fields](context.md)). A handler then changes the store with its mutations and never reaches for the store by name. Only `store.js` is different for each store below. It exports a `store` with the same three members:

- `setQuery(query)` and `setResults(items)` are the mutations. The user's input calls the first, the handler calls the second.
- `onQueryChanged(callback)` tells you about a change of `query`, and returns the function that stops it.

The bus, the events, the handlers and the link from the store to the bus are the same for every store, each in a file of its own: the bus knows no events, and the events know no bus.

```js
// bus.js
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";
import { contextPlugin } from "nanoeffects/context";
import { store } from "./store";

export const bus = createBus()
  .use(emitterPlugin()) // adds bus.emitter
  .use(contextPlugin({ store })); // ctx.store on every task
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

// event → store: the store comes from ctx, and a mutation changes it
bus.on(searchLoaded, (items, { store }) => {
  store.setResults(items);
});
```

```js
// connect.js
import { bus } from "./bus";
import { queryChanged } from "./search";
import { store } from "./store";

// store → event: bus.emitter turns the callback into an emit of queryChanged
export const stopQuery = store.onQueryChanged(bus.emitter(queryChanged));
```

Write `results` and never the field you watch: a handler that changed `query` would start itself again. Find your store below.

### Nanostores

`action` makes a named mutation of an atom. `listen` calls back with the new value; `subscribe` would also call at once, with the current value, so use `listen`.

```js
// store.js
import { action, atom } from "nanostores";

const $query = atom("");
const $results = atom([]);

export const store = {
  // action — a named mutation of an atom
  setQuery: action($query, "setQuery", (target, query) => target.set(query)),
  setResults: action($results, "setResults", (target, items) => target.set(items)),
  // listen — calls back with the new query on every change
  onQueryChanged: (callback) => $query.listen(callback),
};
```

### MobX

`makeAutoObservable` turns the methods of a class into actions, which is where MobX wants changes to happen. `reaction` watches an expression and calls back with its value.

<!-- docs-check: fork -->

```js
// store.js
import { makeAutoObservable, reaction } from "mobx";

class SearchStore {
  query = "";
  results = [];

  constructor() {
    makeAutoObservable(this); // the methods below become actions
  }

  setQuery(query) {
    this.query = query;
  }

  setResults(items) {
    this.results = items;
  }

  // reaction — watches the expression and calls back with its value
  onQueryChanged(callback) {
    return reaction(() => this.query, callback);
  }
}

export const store = new SearchStore();
```

### Valtio

`subscribeKey` watches one field of a proxy state. A mutation assigns to the proxy.

<!-- docs-check: fork -->

```js
// store.js
import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";

const state = proxy({ query: "", results: [] });

export const store = {
  setQuery(query) {
    state.query = query;
  },
  setResults(items) {
    state.results = items;
  },
  // subscribeKey — watches one field
  onQueryChanged: (callback) => subscribeKey(state, "query", callback),
};
```

### Jotai

`sub` gives no value, so read it yourself. A write-only atom is the mutation, and `set` runs it.

<!-- docs-check: fork -->

```js
// store.js
import { atom, createStore } from "jotai";

const queryAtom = atom("");
const resultsAtom = atom([]);
const jotai = createStore();

// write-only atoms: the mutations
const setQueryAtom = atom(null, (_get, set, query) => set(queryAtom, query));
const setResultsAtom = atom(null, (_get, set, items) => set(resultsAtom, items));

export const store = {
  setQuery: (query) => jotai.set(setQueryAtom, query),
  setResults: (items) => jotai.set(setResultsAtom, items),
  // sub calls back without a value; get reads it
  onQueryChanged: (callback) =>
    jotai.sub(queryAtom, () => callback(jotai.get(queryAtom))),
};
```

### Zustand

With `subscribeWithSelector` the selector picks the field, and the callback is called only when it changes. Without a selector Zustand calls back on every `setState`, with the whole state. The mutations are functions in the state.

<!-- docs-check: fork -->

```js
// store.js
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

const useSearch = create(
  subscribeWithSelector((set) => ({
    query: "",
    results: [],
    // the mutations are part of the state
    setQuery: (query) => set({ query }),
    setResults: (items) => set({ results: items }),
  })),
);

export const store = {
  setQuery: (query) => useSearch.getState().setQuery(query),
  setResults: (items) => useSearch.getState().setResults(items),
  // a selector: called back with state.query only when it changes
  onQueryChanged: (callback) => useSearch.subscribe((state) => state.query, callback),
};
```

### Pinia

Pinia (the store of Vue) keeps reactive objects, and its `$subscribe` reports every mutation of the store, not one field. Watch one getter with Vue's `watch` instead: it calls back with the new value. The mutations are the actions of the store.

<!-- docs-check: fork -->

```js
// store.js
import { defineStore } from "pinia";
import { watch } from "vue";

// defineStore — Pinia: the state and the actions of one store
const useSearch = defineStore("search", {
  state: () => ({ query: "", results: [] }),
  actions: {
    setQuery(query) {
      this.query = query;
    },
    setResults(items) {
      this.results = items;
    },
  },
});

const search = useSearch(); // call it after the app has installed Pinia

export const store = {
  setQuery: (query) => search.setQuery(query),
  setResults: (items) => search.setResults(items),
  // watch — calls back with the new query when search.query changes
  onQueryChanged: (callback) => watch(() => search.query, callback),
};
```

### React: sharing a value across components

<!-- docs-check: new -->

A value of your UI (a query, a filter, a name) often has two jobs. Several components read it and re-render when it changes, and the bus must hear about each change to start a handler. The recipes below differ in where the value lives. Pick the first one unless a handler must read the value.

| The value lives in | Use when |
| --- | --- |
| A Context provider with `useState` and `useEventState` | Only components read it. Plain React, one `useEmitter` and one `useEventState` call. |
| A small store on `useSyncExternalStore` | A bus handler, a test or a timer must read it too. |
| An atom of a store library | You already use Nanostores, Jotai and the like. |

#### Plain React: Context, `useEmitter` and `useEventState`

Writing `useEffect(() => bus.emit(...), [value])` looks enough, but it emits on mount, emits twice on mount under StrictMode, and re-runs when the emit function is new on every render. `useEmitter` from `nanoeffects/react` avoids all three. It emits after a render commits with a changed value, never on mount, and compares with `Object.is`. You need React 18 or newer; no other entry of the package uses React.

First the bus, the events and the handlers, each in its own file. `reactPlugin()` adds `bus.useEmitter` and `bus.useEventState`, and destructuring them gives plain hooks that you export from the bus file:

```js
// bus.js
import { createBus } from "nanoeffects";
import { reactPlugin } from "nanoeffects/react";

export const bus = createBus().use(reactPlugin()); // the bus; reactPlugin adds the React hooks
export const { useEmitter, useEventState } = bus; // free hooks: they do not read `this`
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

Then the provider. It holds the state, calls `useEmitter` once to send the query to the bus, and `useEventState` once to receive the result. Every component below it only reads the context:

```jsx
// SearchProvider.jsx
import { createContext, useContext, useState } from "react";
import { useEmitter, useEventState } from "./bus";
import { queryChanged, searchLoaded } from "./search";

const SearchContext = createContext(null);

export function SearchProvider({ children }) {
  const [query, setQuery] = useState("");

  // React → bus: emits queryChanged(query) after every change of query, not on mount
  useEmitter(queryChanged, query);

  // bus → React: like useState([]), but searchLoaded sets the value; one subscription for the whole app
  const [items] = useEventState(searchLoaded, []);

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

Three limits to know:

- **The provider must be mounted first.** `useEventState` is not a store: the bus keeps no values, so a result that arrives before the provider mounts, or after it unmounts, is lost. Put the provider at the root. If a value must survive that, keep it in a store below and write to it from a handler.
- **All consumers re-render** on any change of the context value. Split it into two contexts (`query` and `items`) if that is slow.
- **A new object counts as a change.** For a value that is rebuilt with the same content, pass `equals` in the options, the third argument, to say when two values are the same: `useEmitter(profileChanged, profile, { equals: (previous, next) => previous.id === next.id })`. The same object takes `traceId` and `traceGroupId`, which name the subscription and the flow in the [trace](tracing.md#show-which-subscription-began-a-chain).

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
import { createBus } from "nanoeffects";
import { emitterPlugin } from "nanoeffects/actions";
import { contextPlugin } from "nanoeffects/context";
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

`connect.js` keeps the function that `onQueryChanged` returned (`stopQuery`). Call it yourself, or hand it over: `onAbort(ctx, stopQuery)` inside a task, or `m.signal.addEventListener("abort", stopQuery)` in a module. To stop the other direction, remove the listener of `searchLoaded` with `bus.off(searchLoaded, handler)`, or register it in a module, which removes it on unmount.

### Change the store from any handler

A handler gets the store from `ctx.store` and calls a mutation, whatever it handles: not only the result of a search. The same rule holds: write the field you do not watch. For a MobX `flow`, `onAbort(ctx, () => promise.cancel())` cancels it with the task.
