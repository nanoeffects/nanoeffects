# Policies

> **Level B.** Read first: [Guide](guide.md#1-create-a-bus) steps 1 to 3.

Use this page when handlers overlap in a SPA (search-as-you-type, double submit, leave page). A **policy** wraps a handler and decides what happens then.

Start with `latest`. The table and sections below are the rest of the reference.

## `latest`: abort the previous run

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

Pass `signal` to `fetch` (and the like) so the request cancels. To not pass it at all, bind it once: with `ctx.fetch` the request stops with the handler and there is nothing to forget ([Keep the signal through a handler](pass-the-signal.md#bind-the-signal-once)).

## Choose a policy

Every policy accepts `key` in its options (see [`key`: isolate state by key](#key-isolate-state-by-key)).

| Policy | Overlapping calls |
| ------ | ----------------- |
| `latest(fn)` | previous run aborted, result dropped |
| `leading(fn)` | new calls dropped while a run is going |
| `debounce(ms, fn, options?)` | run after `ms` of quiet |
| `throttle(ms, fn, options?)` | at most one run per `ms` |
| `queue(fn, options?)` | one after another, in order |

Each policy has a short entry in [Look up a policy](#look-up-a-policy).

## Look up a policy

One entry per policy: what it does, and a link to the full recipe.

### `latest`

A newer call aborts the older one and drops its result.

Signature: `latest(fn, options?)`.

More: [`latest`: abort the previous run](#latest-abort-the-previous-run).

### `leading`

New calls are dropped while a run is going.

Signature: `leading(fn, options?)`.

More: [Prevent a double submit](prevent-double-submit.md).

### `debounce`

Runs after a period of quiet.

Signature: `debounce(ms, fn, options?)`.

More: [Configure debounce and throttle](#configure-debounce-and-throttle).

### `throttle`

At most one run within `ms`.

Signature: `throttle(ms, fn, options?)`.

More: [Configure debounce and throttle](#configure-debounce-and-throttle).

### `queue`

Builds a queue of calls: they run one after another, in order.

Signature: `queue(fn, options?)`.

More: [Run calls one after another with `queue`](#run-calls-one-after-another-with-queue).

### `key`

An option of every policy. It splits the state of the policy by a property, for example by id: calls with different keys do not affect each other.

Signature: `latest(fn, { key: (payload) => payload.id })`.

More: [`key`: isolate state by key](#key-isolate-state-by-key).

To use a policy for your own function with no bus, see [`withPolicy`: call a policy outside a bus](#withpolicy-call-a-policy-outside-a-bus).

## Configure debounce and throttle

`debounce` and `throttle` take two options, `leading` and `trailing`. They decide which call of a series runs. `leading` runs the first call of the series at once. `trailing` runs the last call at the end of the series. Both functions are built on the same algorithm as in lodash (and patronum) and behave exactly like them.

**Throttle** (`throttle(ms, fn)`) runs a call at once if it has been idle for at least `ms`, holds the calls that come within `ms`, and runs the last of them when the window closes. Under a steady stream it runs every `ms`.

- `leading` — run the first call of a series at once. It is `true` by default. With `false`, even the first call waits for the end of its window.
- `trailing` — run the last held call when the window closes. It is `true` by default. With `false`, calls made during a window are dropped.

**Debounce** (`debounce(ms, fn)`) runs the last call of a series after `ms` of quiet.

- `trailing` — run the last call after `ms` of quiet. It is `true` by default.
- `leading` — also run the first call of a series at once. It is `false` by default. The closing run then happens only if more calls follow.
- `leading: true, trailing: false` — only the first call of a series.
- Both `false` — nothing runs.

## `key`: isolate state by key

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

## `withPolicy`: call a policy outside a bus

**Problem.** You want a debounced input handler or a "latest request wins" fetch for your own function, but the code has no bus: a DOM handler, a click callback, a function in a service. A policy needs a context on every call, so `debounce(300, search)("re")` does not work on its own.

**When.** One input, button or function needs a policy and nothing else from the library. If you already have a bus, `bus.on(event, policy)` is simpler. In a React component use [`usePolicy`](react.md#keep-a-debounced-handler-between-renders), which also keeps the function between renders.

`withPolicy` takes a policy and returns a plain function. The function needs no bus and no context argument, and it keeps the state of the policy between calls.

```js
import { debounce, withPolicy } from "nanoeffects/policies";

const input = document.querySelector("#search");

// debounce — waits for 300 ms of quiet, then runs the callback
const policy = debounce(300, async (query, { signal }) => {
  const items = await api.search(query, { signal });
  render(items);
});

// withPolicy — a plain function: no bus, no context argument
const onInput = withPolicy(policy);

input.addEventListener("input", (event) => onInput(event.target.value));

// cancel — drops a pending call and aborts a running request, for example when the page closes
window.addEventListener("pagehide", () => onInput.cancel());
```

- The callback has the same `(payload, ctx)` shape as for a bus. `ctx.signal`, `ctx.abort` and `ctx.run` work. `ctx.emit` and `ctx.on` do nothing, because there is no bus.
- Every call returns a promise with the result. A call the policy drops resolves with `undefined`.
- `cancel()` aborts every call that has not finished. Calls made after it work again.
- Where `Symbol.dispose` exists, `using onInput = withPolicy(policy)` calls `cancel()` at the end of the scope.
