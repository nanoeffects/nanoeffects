# Cancel stale requests and fix race conditions

Read this page if an older response can overwrite a newer one: a search box that shows the results of the previous query, a filter that flickers, a form that submits twice. It shows the cause, the fix with `latest`, and how to add a pause, a retry and a timeout. It needs only the bus from the [README](../README.md).

## See the problem

A user types `ab`, then `abc`. Two requests start. If the one for `ab` is slower, it finishes last and its results replace the right ones.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // the bus: events and handlers

// Without a policy every "search" starts its own request, and the slowest one wins.
bus.on("search", async (query) => {
  const items = await api.search(query);
  bus.emit("results", items);
});
```

Checking a counter by hand (`if (id !== lastId) return`) hides the old result, but the old request still runs. Calling `controller.abort()` by hand works, but you must keep the controller somewhere and abort it before each new call.

## Keep only the latest request

Wrap the handler in `latest`. A new `"search"` aborts the task of the previous one, and an aborted task delivers no result.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

// latest: a newer "search" aborts the older run
bus.on(
  "search",
  latest(async (query, { signal }) => {
    // signal: pass it on so the browser cancels the request, not only drops the result
    const items = await api.search(query, { signal });
    bus.emit("results", items);
  }),
);

bus.on("results", (items) => render(items));
```

What to replace: `api.search` is your own request function. It must accept `{ signal }` and give it to `fetch`. Without it, `latest` still ignores the old result, but the request keeps running.

Result: `emit("search", "ab")` followed by `emit("search", "abc")` shows only the results for `abc`, and the request for `ab` is cancelled.

## Wait for a pause in typing

Add `debounce` outside `latest`. The search starts after 300 ms without a new keystroke.

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

// latest: a newer search aborts the request in flight
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  bus.emit("results", items);
});

// debounce: run after 300 ms without a new "typed"
bus.on("typed", debounce(300, searchLatest));
```

## Retry a failed request and limit its time

Use `retry` and `timeout` around the request. The pause grows with each attempt.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { backoff, retry, timeout } from "nanoeffects/effects";

const bus = createBus(); // the bus: events and handlers

// timeout: abort one attempt after 5 s
const searchOnce = timeout(5000, (query, { signal }) => api.search(query, { signal }));

// retry: up to 4 attempts, backoff makes the pause longer each time
const searchWithRetry = retry(searchOnce, {
  times: 4,
  delay: backoff({ base: 200, max: 5000, jitter: true }),
});

// latest: a newer search aborts the whole retry chain
bus.on(
  "search",
  latest(async (query, ctx) => {
    const items = await ctx.run(searchWithRetry, query); // ctx.run: a child task, aborted with this one
    ctx.emit("results", items);
  }),
);
```

## Pick another policy for another race

| Situation | Policy |
| --------- | ------ |
| Only the newest result matters (search, filter, tab switch) | `latest` |
| A second click while the first call runs must be ignored (submit, pay) | `leading` |
| Every call must run, one after another (save, upload) | `queue` |
| Calls come in bursts and you want one at the end | `debounce` |
| Calls come in bursts and you want one per period | `throttle` |
| Each user or item has its own race | add `{ key }`, for example `latest(handler, { key })` |

All policies and their options: [Policies](policies.md). The same step by step in a form: [Build a sign-up form in React](react.md).
