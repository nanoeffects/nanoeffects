# Use nanoeffects with React Query, SWR and RTK Query

Read this page if you fetch data with [React Query](https://tanstack.com/query) (TanStack Query), [SWR](https://swr.vercel.app) or [RTK Query](https://redux-toolkit.js.org/rtk-query/overview) and want `retry`, `timeout` and the abort of nanoeffects inside the request. It shows one action that the libraries call, then three recipes for the parts around it: a client that stops with the request, a live stream into the cache, and a refetch on a bus event.

You need a React project, `nanoeffects`, and one of the libraries. `api` below is your own client: replace it with your requests.

## On this page

- [Decide who owns what](#decide-who-owns-what)
- [Make the action](#make-the-action)
- [Call it from React Query](#call-it-from-react-query)
- [Call it from SWR](#call-it-from-swr)
- [Let the bus know the result](#let-the-bus-know-the-result)
- [Call it from RTK Query](#call-it-from-rtk-query)
- [Give the client its signal once](#give-the-client-its-signal-once)
- [Push a live stream into the cache](#push-a-live-stream-into-the-cache)
- [Refetch queries when the bus says so](#refetch-queries-when-the-bus-says-so)
- [Know the limits](#know-the-limits)

## Decide who owns what

The libraries and nanoeffects do different jobs, so each keeps its own.

| React Query or SWR | nanoeffects |
| ------------------ | ----------- |
| `isLoading`, `data`, `error` | `retry`, `timeout`, `latest` and other policies |
| the cache, one request for the same key | the abort that reaches the request |
| refetch on focus, on reconnect, on interval | the handler: the same code for a test, a worker and the UI |

`isLoading` and `data` come from the library, not from `emit`. `await bus.emit(...)` resolves once, with the result, so it cannot report that the request is still running.

## Make the action

An action with a handler is the request itself. It lives in files that know nothing about React: the bus, the action with its handler, and the component.

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// createBus — the bus the app shares
// signalPlugin — lets emit take { signal }, the signal of the library
export const bus = createBus().use(signalPlugin());
```

The handler tries the request up to three times and gives up after five seconds for each try. `ctx.signal` is the signal of the task: it aborts when the library aborts the request.

```js
// user.js
import { createAction } from "nanoeffects/actions";
import { retry, timeout } from "nanoeffects/effects";

// createAction with a handler — emit returns what the handler returns
export const getUser = createAction("user/get", async (id, ctx) => {
  // one try: the request, with the signal of timeout so it can stop it
  const load = ({ signal }) => api.getUser(id, { signal });
  // timeout — fail the try after 5 s
  const attempt = () => timeout(ctx, 5000, load);
  // retry — up to 3 tries, 500 ms apart
  return retry(ctx, attempt, { times: 3, delay: 500 });
});
```

## Call it from React Query

<!-- docs-check: continue -->

React Query gives `queryFn` a `signal` and aborts it when the query becomes inactive or out of date. Pass it to `emit`. The task is aborted with it, so `timeout` and `retry` stop, and so does the request.

```jsx
// Profile.jsx
import { useQuery } from "@tanstack/react-query";
import { bus } from "./bus";
import { getUser } from "./user";

export function Profile({ id }) {
  const { isLoading, data, error } = useQuery({
    queryKey: ["user", id],
    // emit — runs the action; { signal } ties its task to the signal of React Query
    queryFn: ({ signal }) => bus.emit(getUser(id), { signal }),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>{error.message}</p>;
  return <p>{data.name}</p>;
}
```

The action rejects when all tries fail, so React Query shows the `error`. React Query counts its own `retry` too: set `retry: false` in `useQuery` when the handler already retries, or the tries multiply.

## Call it from SWR

<!-- docs-check: continue -->

SWR does not pass a signal to the fetcher, so there is nothing to give to `emit`. The action still brings `retry` and `timeout`.

```jsx
// Profile.jsx
import useSWR from "swr";
import { bus } from "./bus";
import { getUser } from "./user";

// the fetcher gets the key (here the id) and returns a promise
const fetcher = (id) => bus.emit(getUser(id));

export function Profile({ id }) {
  const { isLoading, data, error } = useSWR(id, fetcher);

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>{error.message}</p>;
  return <p>{data.name}</p>;
}
```

## Let the bus know the result

<!-- docs-check: continue -->

An action with a handler gives its result only to the caller. If a store or another module must react to a loaded user, the handler can say so:

```js
// user-events.js
import { createAction } from "nanoeffects/actions";

// createAction — an event with a payload
export const userLoaded = createAction("user/loaded");
```

Send it from the handler with `ctx.emit(userLoaded(user))`. Do not replace the action with `createJob` here: a job handles the error itself and resolves with `undefined`, so React Query would never see the failure. Use a job when nothing waits for the result and the app shows a loading state from the bus, see [Show a loading state with a job](actions.md#show-a-loading-state-with-a-job).

## Call it from RTK Query

<!-- docs-check: new -->

RTK Query gives the `queryFn` of an endpoint a `signal` in its second argument, so the call is the same as with React Query: pass it to `emit`. This page does not set up the store; see [Stores](stores.md) for that.

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — lets emit take { signal }
export const bus = createBus().use(signalPlugin());
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

// createAction with a handler — emit returns what the handler returns
export const getUser = createAction("user/get", (id, { signal }) =>
  api.getUser(id, { signal }),
);
```

```js
// api-slice.js
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { bus } from "./bus";
import { getUser } from "./user";

export const userApi = createApi({
  reducerPath: "userApi",
  baseQuery: fakeBaseQuery(), // RTK Query — every endpoint brings its own queryFn
  endpoints: (build) => ({
    getUser: build.query({
      // emit — runs the action; { signal } ties its task to the request of RTK Query
      queryFn: async (id, { signal }) => {
        const user = await bus.emit(getUser(id), { signal });
        return { data: user };
      },
    }),
  }),
});
```

## Give the client its signal once

<!-- docs-check: new -->

Problem: the action passes `signal` to every call of `api`, and one forgotten `{ signal }` leaves a request running after the query is gone. `fromSignal` builds the client from the signal of each task, so the handler cannot forget it. Use it when many actions share one client. A single action is simpler as it is in [Make the action](#make-the-action).

`fromSignal` marks a field of `contextPlugin`. The client is made when a handler first reads `ctx.http`, from the `ctx.signal` of that task. More in [Context fields](context.md#build-a-field-from-the-signal-of-each-task).

```js
// bus.js
import axios from "axios";
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";
import { fromSignal, signalPlugin } from "nanoeffects/signal";

// fromSignal — http is a new axios client for each task, bound to the signal of that task
const http = fromSignal((signal) => axios.create({ baseURL: "/api", signal }));

// contextPlugin — every handler gets ctx.http
const context = contextPlugin({ http });

// signalPlugin — emit takes { signal }, so the signal of the query reaches the task
export const bus = createBus().use(signalPlugin()).use(context);
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

// the handler never sees a signal: ctx.http stops when the task aborts
export const getUser = createAction("user/get", async (id, { http }) => {
  const response = await http.get(`/users/${id}`);
  return response.data;
});
```

```jsx
// Profile.jsx
import { useQuery } from "@tanstack/react-query";
import { bus } from "./bus";
import { getUser } from "./user";

export function Profile({ id }) {
  const { data } = useQuery({
    queryKey: ["user", id],
    // emit — the signal of React Query aborts the task, and with it the request of ctx.http
    queryFn: ({ signal }) => bus.emit(getUser(id), { signal }),
  });

  return <p>{data?.name}</p>;
}
```

## Push a live stream into the cache

<!-- docs-check: new -->

Problem: prices arrive from a socket, and the component should show the newest one without a refetch. The socket code emits an event on the bus; the component reads those events with `events` and writes each into the cache. Both libraries have an entry point for pushed data: `setQueryData` in React Query and `useSWRSubscription` in SWR.

`events` gives the payloads to a `for await` loop. `buffer: 1` keeps only the newest price while a write is running. The abort in the cleanup ends the loop and removes the listener. More in [Read an event with a `for await` loop](observable.md#read-an-event-with-a-for-await-loop).

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — the bus the socket code and the components share
export const bus = createBus();
```

```js
// prices.js
import { createAction } from "nanoeffects/actions";

// createAction — the event the socket code emits for every new price
export const priceChanged = createAction("price/changed");
```

```jsx
// Price.jsx
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { events } from "nanoeffects/observable";
import { bus } from "./bus";
import { priceChanged } from "./prices";

export function Price({ symbol }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["price", symbol],
    queryFn: () => api.getPrice(symbol), // the first value; the stream keeps it fresh
  });

  useEffect(() => {
    const controller = new AbortController();
    // events — the newest price event, one at a time
    const prices = events(bus, priceChanged, {
      signal: controller.signal,
      buffer: 1,
    });

    async function follow() {
      for await (const price of prices) {
        if (price.symbol === symbol) {
          queryClient.setQueryData(["price", symbol], price.value); // write into the cache
        }
      }
    }

    follow().catch((error) => {
      if (!controller.signal.aborted) throw error; // the abort ends the loop; anything else is a bug
    });

    return () => controller.abort(); // the component left: the loop ends, the listener goes
  }, [queryClient, symbol]);

  return <p>{data}</p>;
}
```

SWR does the same with `useSWRSubscription` from `swr/subscription`. Its subscribe function gets `next` to push a value and returns the cleanup:

```jsx
// Price.jsx
import useSWRSubscription from "swr/subscription";
import { events } from "nanoeffects/observable";
import { bus } from "./bus";
import { priceChanged } from "./prices";

export function Price({ symbol }) {
  const { data } = useSWRSubscription(["price", symbol], (_key, { next }) => {
    const controller = new AbortController();
    // events — the newest price event, one at a time
    const prices = events(bus, priceChanged, {
      signal: controller.signal,
      buffer: 1,
    });

    async function follow() {
      for await (const price of prices) {
        if (price.symbol === symbol) {
          next(null, price.value); // SWR — push the value to the hook
        }
      }
    }

    follow().catch((error) => {
      if (!controller.signal.aborted) next(error);
    });

    return () => controller.abort(); // SWR calls this when the last component of the key leaves
  });

  return <p>{data}</p>;
}
```

## Refetch queries when the bus says so

<!-- docs-check: new -->

Problem: a save in one part of the app should refresh the lists in another. The save emits an event, and the component that owns the queries listens for it. One `AbortController` ends every listener of the component, instead of one `unbind` for each. For a single listener, `return bus.on(…)` from the effect is shorter.

This needs `signalPlugin`, because `{ signal }` in the options of `on` is read by the plugin. Without it the listeners stay after the component leaves.

```js
// bus.js
import { createBus } from "nanoeffects";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — on takes { signal } and removes the listener when it aborts
export const bus = createBus().use(signalPlugin());
```

```js
// user-events.js
import { createAction } from "nanoeffects/actions";

// createAction — events the save code emits
export const userSaved = createAction("user/saved");
export const userDeleted = createAction("user/deleted");
```

```jsx
// UserList.jsx
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bus } from "./bus";
import { userDeleted, userSaved } from "./user-events";

export function UserList() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers() });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });

    // on with { signal } — both listeners go when the component leaves
    bus.on(userSaved, refresh, { signal });
    bus.on(userDeleted, refresh, { signal });

    return () => controller.abort();
  }, [queryClient]);

  return <ul>{data?.map((user) => <li key={user.id}>{user.name}</li>)}</ul>;
}
```

## Know the limits

- **Without the plugin, `{ signal }` is ignored,** in `emit` and in the options of `on`. The action runs, but the abort does not reach it. Call `bus.use(signalPlugin())` once, where the bus is made.
- **Only the call forms take it.** `bus.emit(getUser(id), { signal })` works; `bus.emit("user/get", id, { signal })` does not.
- **A handler that returns without a promise is finished with the call**, so a signal that aborts later does not reach it. Actions that fetch are async, so this only matters for a sync handler that sets up a callback.
- **Give each request its own signal for an event.** For an action with a handler or a job the link ends when it settles. For `bus.emit(action, { signal })` it stays until the signal aborts.
- **The signal reaches the tasks that this `emit` starts**, with the listeners of the action's type and the `ctx.run` children. A separate `bus.emit` that the handler makes is not linked: pass `{ signal: ctx.signal }` to it.

A whole small app, with a search, a filter, pages and a detail panel, is in the [Rick and Morty example](../examples/rickandmorty).
