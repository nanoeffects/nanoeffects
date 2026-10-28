# Policies

Use this page when handlers overlap in a SPA (search-as-you-type, double submit, leave page). A **policy** wraps a handler and decides what happens then.

Start with `latest`. The table and sections below are the rest of the reference.

## Abort the previous run

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// latest — a newer run aborts the older one
bus.on(
  "search",
  latest(async (query, { signal }) => {
    // signal — lets latest cancel this request, not only drop its result
    await api.search(query, { signal });
  }),
);
```

Pass `signal` to `fetch` (and the like) so the request cancels.

## Choose a policy

Every policy accepts `key` in its options (see [Isolate state by key](#isolate-state-by-key)).

| Policy | Overlapping calls |
| ------ | ----------------- |
| `latest(fn)` | previous run aborted, result dropped |
| `leading(fn)` | new calls dropped while a run is going |
| `debounce(ms, fn, options?)` | run after `ms` of quiet |
| `throttle(ms, fn, options?)` | at most one run per `ms` |
| `queue(fn, options?)` | one after another, in order |

## Configure debounce and throttle

`debounce` and `throttle` take `leading` and `trailing`. Behavior matches lodash (and patronum); tests compare random call sequences to lodash itself.

**Throttle** (`throttle(ms, fn)`):

- Default `leading: true`, `trailing: true`.
- A call when the throttle is idle (at least `ms` after the previous call and run) runs at once.
- Calls made while it waits are held; the latest runs when the window closes.
- Under a steady stream it runs every `ms`.
- `leading: false` — even the first call waits for the end of its window.
- `trailing: false` — drop calls made during a window.

**Debounce** (`debounce(ms, fn)`):

- Default `trailing: true` — run the last call after `ms` of quiet.
- `leading: true` — also run the first call of a burst at once; the trailing run happens only if more calls follow.
- `leading: true, trailing: false` — only the first call of a burst.
- Both `false` — nothing runs.

## Isolate state by key

`key` gives each key its own state. Calls with different keys do not affect each other. Idle keys are dropped, so keys can be unbounded (ids, urls).

```js
import { createBus } from "nanoeffects";
import { latest, queue } from "nanoeffects/policies";

const bus = createBus();

// one latest run per user id
bus.on(
  "load",
  latest(loadUser, { key: (user) => user.id }),
);

// uploads of the same file go one after another
bus.on(
  "upload",
  queue(upload, { key: (file) => file.name }),
);
```

## Run calls one after another with `queue`

```js
import { createBus } from "nanoeffects";
import { queue } from "nanoeffects/policies";

const bus = createBus();

// queue — one after another, in order
bus.on(
  "save",
  queue(async (draft, { signal }) => {
    await api.save(draft, { signal });
  }),
);

bus.emit("save", draftA); // runs now
bus.emit("save", draftB); // waits for draftA, then runs
```

| Option | Meaning |
| ------ | ------- |
| `concurrency` | how many calls may run at once (default `1`) |
| `limit` | how many calls may wait |
| `overflow` | when the line is full: `"drop-new"` (default) or `"drop-old"` |

A dropped call resolves with `undefined`. `queue(fn, { limit: 1, overflow: "drop-old" })` keeps only the latest waiting call. `limit: 0` lets nothing wait.

Every call returns a promise with the result of its own run. An error rejects only that call; the queue continues.

**Abort:**

- A waiting call whose task aborts is skipped and resolves with `undefined`.
- When a running call aborts, its slot is freed at once and its result is dropped.
- Pass `signal` into what `fn` does. A `fn` that ignores it can overlap with the next run.

## Use a policy without a bus

**Problem.** You want a debounced input handler or a "latest request wins" fetch, but your code has no bus. A policy needs a context on every call, so `debounce(300, search)("re")` does not work on its own.

**When.** One component or module needs a policy and nothing else from the library. If you already have a bus, `bus.on(event, policy)` is simpler.

`withPolicy` takes the result of any policy and returns a plain function. It needs no bus and no context argument, and it keeps the state of the policy between calls.

```js
import { debounce, withPolicy } from "nanoeffects/policies";

// debounce — waits for 300 ms of quiet, then runs the callback
const policy = debounce(300, async (query, { signal }) => {
  await api.search(query, { signal });
});

// withPolicy — a plain function: no bus, no context argument
const onChange = withPolicy(policy);

onChange("re");
onChange("redux"); // only this call runs, 300 ms after it

// cancel — drops a pending call and aborts a running one
onChange.cancel();
```

- The callback has the same `(payload, ctx)` shape as for a bus. `ctx.signal`, `ctx.abort` and `ctx.run` work. `ctx.emit` and `ctx.on` do nothing, because there is no bus.
- Every call returns a promise with the result. A call the policy drops resolves with `undefined`.
- `cancel()` aborts every call that has not finished. Calls made after it work again.
- Where `Symbol.dispose` exists, `using onChange = withPolicy(policy)` calls `cancel()` at the end of the scope.

In a React component, use [`usePolicy`](react.md#keep-a-debounced-handler-between-renders) instead: it keeps the function between renders.
