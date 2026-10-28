# Debounce a request and abort the previous one

Read this page if you debounce user input (a search box, an autosave, a resize handler) and you also want the request in flight to stop when a new one starts. `debounce` alone waits for a pause. It does not cancel a request that already started. This page shows the two policies together, the order to put them in, and when to use `throttle` instead.

## Know what each policy does

| Policy | What it does | What it does not do |
| ------ | ------------ | ------------------- |
| `debounce(ms, fn)` | runs `fn` after `ms` without a new call | does not cancel a run that already started |
| `latest(fn)` | aborts the previous run when a new one starts | does not wait for a pause |

Use both for a search box. `debounce` sends fewer requests. `latest` cancels the slow one when the user types again after the pause.

## Combine them

Put `debounce` outside and `latest` inside. The event waits for a pause first. When the run starts, it aborts the previous run.

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

// latest: a newer run aborts the older request
const searchLatest = latest(async (query, { signal }) => {
  // signal: pass it on so the browser cancels the request itself
  const items = await api.search(query, { signal });
  bus.emit("results", items);
});

// debounce: run searchLatest after 300 ms without a new "typed"
bus.on("typed", debounce(300, searchLatest));

bus.on("results", (items) => render(items));
```

What to replace: `api.search` is your own request function. It must accept `{ signal }` and give it to `fetch`. `render` shows the items.

Result: typing `a`, `ab`, `abc` within 300 ms sends one request for `abc`. If the user types `abcd` while that request runs, the request for `abc` is aborted and one for `abcd` starts after the pause.

## Run the first call at once

By default `debounce` waits even before the first call. For an input where the first key press should react at once, add `leading: true`. The first call of a burst runs immediately, and the last one runs after the pause.

```js
import { createBus } from "nanoeffects";
import { debounce } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

const showSuggestions = (query) => console.log("suggest", query);

// debounce with leading: the first call runs at once, the last one after 300 ms of quiet
bus.on("typed", debounce(300, showSuggestions, { leading: true }));
```

`leading` and `trailing` follow lodash. All combinations: [Policies](policies.md#configure-debounce-and-throttle).

## Use throttle for continuous input

`debounce` never runs while calls keep coming. For a scroll or a drag you want updates during the movement. Use `throttle`: at most one run per period.

```js
import { createBus } from "nanoeffects";
import { throttle } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

const saveScroll = (position) => localStorage.setItem("scroll", String(position));

// throttle: at most one run per 100 ms while "scrolled" keeps coming
bus.on("scrolled", throttle(100, saveScroll));
```

## Debounce without a bus

If the page has no bus, wrap the same pair with `withPolicy`. The result is a plain function that you call from an input handler.

```js
import { debounce, latest, withPolicy } from "nanoeffects/policies";

// latest: a newer run aborts the older request
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  console.log(items);
});

// withPolicy: debounce by 300 ms, called as a plain function
const onTyped = withPolicy(debounce(300, searchLatest));

onTyped("a");
onTyped("ab"); // only "ab" runs, 300 ms later

// cancel: drop a pending call and abort a running request, for example on page leave
onTyped.cancel();
```

In a React component use [`usePolicy`](react.md#keep-a-debounced-handler-between-renders), which also cancels on unmount.

## Check these when it does not cancel

- The request did not get `signal`. `latest` then drops the old result but the request goes on.
- The order is reversed. Write `debounce(300, latest(handler))`, as above, so `debounce` receives the events and `latest` guards the request.
- Several inputs share one event. Give each its own event name, or use `{ key }`, for example `latest(handler, { key: (input) => input.id })`.

Related: [Cancel stale requests](cancel-stale-requests.md), [Policies](policies.md).
