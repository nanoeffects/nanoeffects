# Use nanoeffects with React Query and SWR

Read this page if you fetch data with [React Query](https://tanstack.com/query) (TanStack Query) or [SWR](https://swr.vercel.app) and want `retry`, `timeout` and the abort of nanoeffects inside the request. It shows one action that both libraries call.

You need a React project, `nanoeffects`, and one of the two libraries. `api` below is your own client: replace it with your requests.

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
    // emit — runs the command; { signal } ties its task to the signal of React Query
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

## Know the limits

- **Without the plugin, `{ signal }` is ignored.** The action runs, but the abort does not reach it. Call `bus.use(signalPlugin())` once, where the bus is made.
- **Only the call forms take it.** `bus.emit(getUser(id), { signal })` works; `bus.emit("user/get", id, { signal })` does not.
- **A handler that returns without a promise is finished with the call**, so a signal that aborts later does not reach it. Actions that fetch are async, so this only matters for a sync handler that sets up a callback.
- **Give each request its own signal for an event.** For an action with a handler or a job the link ends when it settles. For `bus.emit(action, { signal })` it stays until the signal aborts.
- **The signal reaches the tasks that this `emit` starts**, with the listeners of the action's type and the `ctx.run` children. A separate `bus.emit` that the handler makes is not linked: pass `{ signal: ctx.signal }` to it.

A whole small app, with a search, a filter, pages and a detail panel, is in the [Rick and Morty example](../examples/rickandmorty).
