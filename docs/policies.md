# Policies

> **Level B.** Read first: [Guide](guide.md#1-create-a-bus) steps 1 to 3.

Use this page when handlers overlap in a SPA (search-as-you-type, double submit, leave page). A **policy** wraps a handler and decides what happens then.

Start with `latest`. The table and sections below are the rest of the reference.

## On this page

- [`latest`: abort the previous run](#latest-abort-the-previous-run)
- [Choose a policy](#choose-a-policy)
- [Look up a policy](#look-up-a-policy)
  - [`latest`](#latest)
  - [`leading`](#leading)
  - [`debounce`](#debounce)
  - [`throttle`](#throttle)
  - [`queue`](#queue)
  - [`dedupe`](#dedupe)
  - [`distinct`](#distinct)
  - [`rateLimit`](#ratelimit)
  - [`batch`](#batch)
  - [`key`](#key)
- [Configure debounce and throttle](#configure-debounce-and-throttle)
- [`key`: isolate state by key](#key-isolate-state-by-key)
- [Run calls one after another with `queue`](#run-calls-one-after-another-with-queue)
- [`dedupe`: share one run between equal calls](#dedupe-share-one-run-between-equal-calls)
- [`distinct`: skip a repeated payload](#distinct-skip-a-repeated-payload)
- [`rateLimit`: stay under a quota](#ratelimit-stay-under-a-quota)
- [`batch`: send many calls as one](#batch-send-many-calls-as-one)
- [`withPolicy`: call a policy outside a bus](#withpolicy-call-a-policy-outside-a-bus)

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

Pass `signal` to `fetch` (and the like) so the request cancels. To not pass it at all, bind it once: with `signalFetch(ctx, url)` the request stops with the handler and there is nothing to forget ([Keep the signal through a handler](pass-the-signal.md#bind-the-signal-once)).

## Choose a policy

Every policy accepts `key` in its options (see [`key`: isolate state by key](#key-isolate-state-by-key)).

| Policy | Overlapping calls |
| ------ | ----------------- |
| `latest(fn)` | previous run aborted, result dropped |
| `leading(fn)` | new calls dropped while a run is going |
| `debounce(ms, fn, options?)` | run after `ms` of quiet |
| `throttle(ms, fn, options?)` | at most one run per `ms` |
| `queue(fn, options?)` | one after another, in order |
| `dedupe(fn, options?)` | calls with the same key share the run that is going |
| `distinct(fn, options?)` | a call with the same payload as the last one is skipped |
| `rateLimit(limit, ms, fn, options?)` | at most `limit` runs start per `ms`, the rest wait |
| `batch(ms, fn, options?)` | payloads of one window go to `fn` as one array |

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

Runs after `ms` of quiet.

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

### `dedupe`

While the first run goes, calls with the same payload get its result.

Signature: `dedupe(fn, options?)`.

More: [`dedupe`: share one run between equal calls](#dedupe-share-one-run-between-equal-calls).

### `distinct`

A call with the same payload as the last one is skipped: the work does not run.

Signature: `distinct(fn, options?)`.

More: [`distinct`: skip a repeated payload](#distinct-skip-a-repeated-payload).

### `rateLimit`

At most `limit` runs start in any window of `ms`. The other calls wait for their turn.

Signature: `rateLimit(limit, ms, fn, options?)`.

More: [`rateLimit`: stay under a quota](#ratelimit-stay-under-a-quota).

### `batch`

Collects the payloads that come in a window of `ms` and calls `fn` once with all of them.

Signature: `batch(ms, fn, options?)`.

More: [`batch`: send many calls as one](#batch-send-many-calls-as-one).

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

## `dedupe`: share one run between equal calls

> **Level B or C.** Use it for reads that several parts of the screen start at the same time.

**Problem.** Three components ask for user `1` in the same tick. Without a policy that is three identical requests.

**When.** A read that is safe to repeat: a profile, a config, a list by id. For a write use [`leading`](prevent-double-submit.md) or [`queue`](#run-calls-one-after-another-with-queue): see the abort rule below.

`dedupe` starts `fn` for the first call. A call with the same key that comes while that run is going waits for it and gets its result, or its error. When the run ends, `dedupe` forgets it, and the next call starts `fn` again. It is not a cache: it never returns an old value.

```js
import { dedupe, withPolicy } from "nanoeffects/policies";

// dedupe — callers with the same id share one request
const policy = dedupe((id, { signal }) => api.getUser(id, { signal }));

// withPolicy — a plain function, so the example shows the result of each call
const loadUser = withPolicy(policy);

// two callers, one request: both get the same user
const [first, second] = await Promise.all([loadUser(1), loadUser(1)]);
```

On a bus it looks the same, `bus.on("user/load", dedupe(handler))`. To get the result of `emit` use an action or a job ([Actions](actions.md)).

| Option | Meaning |
| ------ | ------- |
| `key` | what makes two calls "the same". Default: the payload itself, compared like a `Map` key. Objects never match unless `key` says how. `key: () => "all"` shares one run between every call |

**Abort:**

- A caller whose task aborts resolves with `undefined`. The others go on.
- The run belongs to the task of the first caller. If that task aborts while others still wait, the run is aborted and started again with the next caller, so `fn` can run twice for one request. That is fine for a read and wrong for a write.
- Pass `signal` into what `fn` does, as for any policy.

## `distinct`: skip a repeated payload

> **Level B.** Use it when the same value keeps arriving and repeating the work is a waste.

**Problem.** A form saves on every change. A user types a letter and deletes it, and the same text goes to the server again.

`distinct` compares the payload of each call with the payload of the last call it let through. An equal payload is skipped: `fn` does not run and the call resolves with `undefined`. It remembers one payload, never a result.

```js
import { distinct, withPolicy } from "nanoeffects/policies";

// distinct — runs only when the text differs from the last one it let through
const policy = distinct(async (text) => {
  await api.save(text);
});
const save = withPolicy(policy);

await save("hello"); // runs
await save("hello"); // skipped, resolves undefined
await save("hello!"); // runs: the text changed
```

| Option | Meaning |
| ------ | ------- |
| `equals(previous, next)` | tells whether two payloads are the same. Default: `Object.is` |
| `key` | each key remembers its own payload |

- The payload counts as seen from the moment its run starts, so the same payload that arrives while the run goes is skipped too.
- It is forgotten when the run fails or its task aborts, so a retry with the same payload runs.
- The memory of a key stays after the run. Unlike other policies, `distinct` does not drop idle keys, so give `key` values from a bounded set (a form id, not a request id).

## `rateLimit`: stay under a quota

> **Level C.** Use it when an API allows N requests per period.

**Problem.** A geocoding API allows 5 requests per second. A list of 40 addresses sends 40 requests at once, and most of them fail with `429`.

`rateLimit(limit, ms, fn)` lets at most `limit` runs start in any window of `ms` milliseconds. The window slides: it is counted back from each call. A call over the limit waits and starts, in order, when the oldest start leaves the window.

```js
import { rateLimit, withPolicy } from "nanoeffects/policies";

// rateLimit — 5 runs may start per second, the rest wait their turn
const policy = rateLimit(5, 1000, (address, { signal }) => {
  return api.geocode(address, { signal });
});
const geocode = withPolicy(policy);

const addresses = ["10 Main St", "22 Oak Ave", "5 Pine Rd", "8 Elm St", "3 Lake Dr", "9 Hill Ln"];

// the first five start at once, the sixth a second later
const results = await Promise.all(addresses.map(geocode));
```

| Option | Meaning |
| ------ | ------- |
| `overflow` | `"wait"` (default) keeps a call until it can start. `"drop"` drops a call that finds the window full: it resolves with `undefined` |
| `key` | each key has its own window, for example one per user |

- It limits **starts**, not how many runs go at the same time, and it does not wait for a run to end. For both limits write `queue(rateLimit(5, 1000, fn), { concurrency: 2 })`: a call keeps its slot in the queue while it waits for the window.
- A call whose task aborts while it waits leaves the line. Aborting a run that has started does not give its place in the window back: the request was sent.
- A `limit` below 1 is 1.

## `batch`: send many calls as one

> **Level C.** Use it when work is cheaper in bulk: events for analytics, log lines, "get these ids".

**Problem.** A page sends an analytics event for every click, 30 requests a minute. The server prefers one request with all of them.

`batch(ms, fn)` opens a window of `ms` at the first call and collects the payloads that come in it. When the window closes, `fn` runs once with an array of them, in the order of the calls. The window does not move when more calls come, so a steady stream is sent every `ms`, not only when it stops.

```js
import { batch, withPolicy } from "nanoeffects/policies";

// batch — fn gets an array of everything that came within 500 ms
const policy = batch(500, async (events) => {
  await api.sendEvents(events);
});
const track = withPolicy(policy);

track({ name: "open" });
track({ name: "click" }); // one request with both events, 500 ms after the first
```

| Option | Meaning |
| ------ | ------- |
| `maxSize` | send the batch at once when it holds this many payloads |
| `key` | each key collects its own batch, for example one per user |

- Every call resolves with what `fn` returned for its batch: the same value for all, or the same error. `batch` does not split an array result between callers.
- A call whose task aborts while the batch is collecting leaves it and resolves with `undefined`. When every call has left, nothing runs.
- `fn` gets the context of the first caller that is still waiting. If that task aborts while `fn` runs, the run is aborted and every caller of that batch resolves with `undefined`. The run is not repeated: part of a bulk call may have happened.

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
