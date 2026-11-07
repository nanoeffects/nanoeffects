# Common tasks

> **Levels A to E.** Read first: [README](../README.md).

Each task below starts with the problem, then a short solution. Where the page has more to say, the last line links to it. The tasks go from the simplest to the most involved.

## On this page

- [Events and handlers](#events-and-handlers)
  - [A handler needs an API client, a store or a logger](#a-handler-needs-an-api-client-a-store-or-a-logger)
  - [One handler fails, the others must still run](#one-handler-fails-the-others-must-still-run)
  - [A typo in an event name](#a-typo-in-an-event-name)
- [Races and repeated actions in the UI](#races-and-repeated-actions-in-the-ui)
  - [An old response overwrites a new one](#an-old-response-overwrites-a-new-one)
  - [A search box sends a request on every key](#a-search-box-sends-a-request-on-every-key)
  - [A second click sends a second request](#a-second-click-sends-a-second-request)
  - [Messages must go out in order](#messages-must-go-out-in-order)
  - [A "Delete" button in a list blocks the other rows](#a-delete-button-in-a-list-blocks-the-other-rows)
  - [Several components ask for the same data](#several-components-ask-for-the-same-data)
  - [A form saves the same text twice](#a-form-saves-the-same-text-twice)
- [An unreliable network and long flows](#an-unreliable-network-and-long-flows)
  - [A request fails sometimes: retry and backoff](#a-request-fails-sometimes-retry-and-backoff)
  - [A request hangs: timeout](#a-request-hangs-timeout)
  - [Refresh data every N seconds: poll](#refresh-data-every-n-seconds-poll)
  - [Wait for another event inside a handler: take](#wait-for-another-event-inside-a-handler-take)
  - [Load several things at once: all](#load-several-things-at-once-all)
  - [Take the fastest answer: race](#take-the-fastest-answer-race)
  - [A flow stops halfway: roll the finished steps back](#a-flow-stops-halfway-roll-the-finished-steps-back)
  - [An API allows only N requests per second](#an-api-allows-only-n-requests-per-second)
  - [Many small events, one request](#many-small-events-one-request)
- [Features and domain logic](#features-and-domain-logic)
  - [Get the result of emit](#get-the-result-of-emit)
  - [Group a feature with its handlers: modules](#group-a-feature-with-its-handlers-modules)
  - [Do not leave subscriptions after a widget closes](#do-not-leave-subscriptions-after-a-widget-closes)
- [Stop work on a server](#stop-work-on-a-server)
- [Debugging: what ran and why](#debugging-what-ran-and-why)
- [Test a policy with fake timers](#test-a-policy-with-fake-timers)
- [Other libraries in the project](#other-libraries-in-the-project)
- [Classes and TypeScript](#classes-and-typescript)
  - [Use the bus in a class](#use-the-bus-in-a-class)
  - [Keep the types of the bus in many files](#keep-the-types-of-the-bus-in-many-files)
- [Examples of whole apps](#examples-of-whole-apps)

## Events and handlers

### A handler needs an API client, a store or a logger

Many handlers use the same `api` client or logger. Importing it in every handler file ties the handlers to one client and makes tests harder. Put it on the bus once, and every task gets it on `ctx`.

```js
import { createBus } from "nanoeffects";

// createBus({ context }) — every task gets these fields on ctx
const bus = createBus({ context: { api, logger } });

bus.on("save", async (draft, { api, logger }) => {
  await api.save(draft);
  logger.info("saved");
});
```

More: [Context fields](context.md).

### One handler fails, the others must still run

Two handlers listen to `order/placed`: one sends analytics, the other saves the order. By default the first error stops the loop, so a broken analytics call can keep the order from being saved. With `onError` every handler runs and the errors go to one place.

```js
import { createBus } from "nanoeffects";

const bus = createBus({
  // onError — isolates the handlers: a thrown error goes here and the next handler still runs
  onError: (error, { type }) => report(error, type),
});

const sendAnalytics = (order) => {
  throw new Error(`analytics is down for ${order.id}`);
};
const saveOrder = (order) => console.log("saved", order.id);

bus.on("order/placed", sendAnalytics); // throws
bus.on("order/placed", saveOrder); // still runs

bus.emit("order/placed", { id: 1 }); // saved 1
```

More: [Errors and unheard events](errors.md#isolate-failing-handlers).

### A typo in an event name

`emit("serch")` does not fail: no one listens to that name, so nothing happens, and you look for the bug in the handler. `onUnhandled` warns about an event that nobody heard. Turn it on in development.

```js
import { createBus } from "nanoeffects";

const bus = createBus({
  // onUnhandled — called when an event has no listeners
  onUnhandled: ({ type }) => console.warn(`Nobody listens to "${type}"`),
});

bus.on("search", (query) => console.log(query));

bus.emit("serch", "nano"); // warning: Nobody listens to "serch"
```

More: [Warn when nobody listens](errors.md#warn-when-nobody-listens).

## Races and repeated actions in the UI

### An old response overwrites a new one

A user types `re`, then `react`. Two requests are in flight. The server answers `react` fast and `re` slowly, so the answer for `re` arrives last and replaces the right list with the wrong one. This is what a plain React effect does:

```jsx
import { useEffect, useState } from "react";

export function Search({ query }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    // two requests are in flight, and the one that finishes last wins, even the older one
    api.search(query).then(setItems);
  }, [query]);

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.title}</li>
      ))}
    </ul>
  );
}
```

Move the request into a handler with `latest`: a new `search` aborts the previous request, and the aborted one delivers no result.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// latest — a new "search" aborts the previous one and drops its result
bus.on(
  "search",
  latest(async (query, { signal }) => {
    // signal — lets the browser cancel the request itself
    const items = await api.search(query, { signal });
    bus.emit("results", items);
  }),
);

bus.on("results", (items) => render(items));
```

More: [Cancel stale requests](cancel-stale-requests.md), [Policies](policies.md#latest-abort-the-previous-run), and the component side in [Build a sign-up form in React](react.md).

### A search box sends a request on every key

Typing `react` sends five requests, and the list flickers. `debounce` waits for a pause in typing; `latest` aborts the request that is still in flight.

```js
import { createBus } from "nanoeffects";
import { debounce, latest } from "nanoeffects/policies";

const bus = createBus();

// latest — a new search aborts the request in flight
const searchLatest = latest(async (query, { signal }) => {
  const items = await api.search(query, { signal });
  bus.emit("results", items);
});

// debounce — start after 300 ms without a new "typed"
bus.on("typed", debounce(300, searchLatest));
```

More: [Pause between requests](debounce-and-abort.md).

### A second click sends a second request

A user double-clicks "Sign up" on a slow network, and two accounts are created. `leading` drops every call that comes while the first one still runs.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus();

// leading — a call that comes while the previous one runs is dropped
bus.on(
  "form/submitted",
  leading(async (form, { signal }) => {
    await api.signUp(form, { signal });
  }),
);
```

More: [Prevent a double submit](prevent-double-submit.md).

### Messages must go out in order

In a chat, a user sends `Hello` and then `How are you?` within a second. Two parallel requests can reach the server in the wrong order. `queue` sends the next message only after the previous one is delivered.

```js
import { createBus } from "nanoeffects";
import { queue } from "nanoeffects/policies";

const bus = createBus();

// queue — the next message waits until the previous one is delivered
bus.on(
  "message/sent",
  queue(async (message, { signal }) => {
    await api.sendMessage(message, { signal });
  }),
);
```

More: [Policies, `queue`](policies.md#run-calls-one-after-another-with-queue).

### A "Delete" button in a list blocks the other rows

You protect "Delete" with `leading`. While one row is deleted, clicks on the other rows are dropped too, because the whole handler has one state. `key` gives every row its own state.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus();

// leading with key — every row id has its own state, so other rows are not blocked
bus.on(
  "row/deleted",
  leading(
    async (row, { signal }) => {
      await api.deleteRow(row.id, { signal });
    },
    { key: (row) => row.id },
  ),
);
```

More: [Policies, `key`](policies.md#key-isolate-state-by-key).

### Several components ask for the same data

A page shows a user in the header, in a sidebar and in a comment, and all three ask for user `1` in the same tick. That is three identical requests. `dedupe` makes the calls for one id share a single request. Use it for reads, not for writes.

```js
import { createBus } from "nanoeffects";
import { dedupe } from "nanoeffects/policies";

const bus = createBus();

// dedupe — a call for an id that is loading already waits for that request
bus.on(
  "user/needed",
  dedupe(async (id, ctx) => {
    const user = await api.getUser(id, { signal: ctx.signal });
    ctx.emit("user/loaded", user);
  }),
);
```

More: [Policies, `dedupe`](policies.md#dedupe-share-one-run-between-equal-calls).

### A form saves the same text twice

A form saves on every change. A user types a letter and deletes it, and the same text goes to the server again. `distinct` skips a call whose payload equals the last one.

```js
import { createBus } from "nanoeffects";
import { distinct } from "nanoeffects/policies";

const bus = createBus();

// distinct — a text equal to the last saved one is skipped
bus.on(
  "draft/changed",
  distinct(async (text, { signal }) => {
    await api.saveDraft(text, { signal });
  }),
);
```

More: [Policies, `distinct`](policies.md#distinct-skip-a-repeated-payload).

## An unreliable network and long flows

### A request fails sometimes: retry and backoff

A request fails once in a while because of the network. `retry` repeats it. If the server is overloaded, repeating at once makes it worse, so use `backoff` to make the pause longer with each attempt.

```js
import { createBus } from "nanoeffects";
import { backoff, retry } from "nanoeffects/effects";

const bus = createBus();

// retry — repeat the request after an error, up to 4 attempts
const loadWithRetry = retry((id, { signal }) => api.getUser(id, { signal }), {
  times: 4,
  // backoff — the pause grows (200, 400, 800 ms) with a random part, so clients do not retry at the same moment
  delay: backoff({
    base: 200,
    max: 5000,
    jitter: true,
  }),
});

bus.on("user/opened", loadWithRetry);
```

More: [`backoff`](effects.md#backoff).

### A request hangs: timeout

A request does not fail and does not answer, and the spinner spins forever. `timeout` rejects the call after the time you set and aborts the request.

```js
import { createBus } from "nanoeffects";
import { timeout } from "nanoeffects/effects";

const bus = createBus();

// timeout — reject with TimeoutError and abort the request after 5 s
const loadOnce = timeout(5000, (id, { signal }) => api.getUser(id, { signal }));

bus.on("user/opened", loadOnce);
```

More: [`timeout`](effects.md#timeout).

### Refresh data every N seconds: poll

A dashboard must refresh its numbers every ten seconds while it is open. `poll` is an effect: it calls your function on a timer and ends when the task is aborted, so a closed dashboard does not keep asking.

```js
import { createBus } from "nanoeffects";
import { poll } from "nanoeffects/effects";

const bus = createBus();

bus.on("dashboard/opened", async (_, ctx) => {
  // stop the polling when the user leaves
  ctx.on("dashboard/closed", () => ctx.abort());

  // poll — call refresh every 10 s until the task is aborted
  await poll(ctx, () => refresh(), 10_000);
});
```

More: [`poll`](effects.md#poll).

### Wait for another event inside a handler: take

After a login the handler must wait for the user to log out before it cleans up. Instead of a flag and a second handler, `take` pauses the handler until the next event with that name.

```js
import { createBus } from "nanoeffects";
import { take } from "nanoeffects/effects";

const bus = createBus();

bus.on("login", async (user, ctx) => {
  // take — pause this handler until the next "logout"
  const reason = await take(ctx, "logout");
  cleanup(user, reason);
});
```

More: [`take`](effects.md#take).

### Load several things at once: all

A profile page needs the user and the posts. Loading them one after another is slow. `all` runs both requests together and aborts the second one if the first fails.

```js
import { createBus } from "nanoeffects";
import { all } from "nanoeffects/effects";

const bus = createBus();

bus.on("profile/opened", async (id, ctx) => {
  // all — run both requests together; if one fails, the other is aborted. child carries the signal of its own request
  const { user, posts } = await all(ctx, {
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });

  ctx.emit("profile/loaded", { user, posts });
});
```

### Take the fastest answer: race

The same data lives on two servers, and you want the answer of the faster one. `race` returns the first answer and aborts the other request.

```js
import { createBus } from "nanoeffects";
import { race } from "nanoeffects/effects";

const bus = createBus();

bus.on("user/opened", async (id, ctx) => {
  // race — the first answer wins, the slower request is aborted
  const result = await race(ctx, {
    primary: (child) => api.getUser(id, child),
    backup: (child) => api.getUserFromBackup(id, child),
  });

  const user = "primary" in result ? result.primary : result.backup;
  ctx.emit("user/loaded", user);
});
```

More: [`all`](effects.md#all), [`race`](effects.md#race).

### A flow stops halfway: roll the finished steps back

A checkout creates an order, then charges the card. If the charge fails, the order stays in the system without a payment. If the user leaves the page between the two calls, the same happens. `transaction` runs the steps in order and, when one fails or the task is aborted, calls the `rollback` of the steps that finished, last first.

```js
import { createBus } from "nanoeffects";
import { retry, transaction } from "nanoeffects/effects";

const bus = createBus();

// retry with {} — a rollback may fail too, so try the refund up to 3 times; {} means no signal, an abort does not stop it
const refundWithRetry = (paymentId) =>
  retry({}, () => api.refund(paymentId), { times: 3 });

bus.on("checkout", async (order, ctx) => {
  // transaction — run the steps in order; if one fails, roll back the finished ones, last first
  const [orderId, paymentId] = await transaction(
    ctx,
    {
      run: ({ signal }) => api.createOrder(order, { signal }),
      // rollback gets what run returned, and no abort signal
      rollback: (orderId) => api.cancelOrder(orderId),
    },
    {
      run: ({ signal }) => api.charge(order, { signal }),
      rollback: refundWithRetry,
    },
  );

  ctx.emit("checkoutDone", { orderId, paymentId });
});
```

The list of finished steps lives in memory: a closed tab loses a rollback that did not run. Make each `rollback` safe to call twice.

More: [`transaction`](effects.md#transaction), with the strategy options `rollbackOn`, `rollbackFailure` and `rollbackOrder`.

### An API allows only N requests per second

A geocoding API allows 5 requests per second. A list of 40 addresses sends 40 requests at once, and most fail with `429`. `rateLimit` starts five and holds the rest until the window slides.

```js
import { createBus } from "nanoeffects";
import { rateLimit } from "nanoeffects/policies";

const bus = createBus();

// rateLimit — five requests may start per second, the others wait their turn
bus.on(
  "address/geocode",
  rateLimit(5, 1000, async (address, ctx) => {
    const place = await api.geocode(address, { signal: ctx.signal });
    ctx.emit("address/found", place);
  }),
);
```

More: [Policies, `rateLimit`](policies.md#ratelimit-stay-under-a-quota).

### Many small events, one request

A page sends an analytics event on every click, 30 requests a minute. The server prefers one request with all of them. `batch` collects the events that come within a window and sends them together.

```js
import { createBus } from "nanoeffects";
import { batch } from "nanoeffects/policies";

const bus = createBus();

// batch — everything that comes within 500 ms goes in one request
bus.on(
  "analytics/event",
  batch(500, async (events, { signal }) => {
    await api.sendEvents(events, { signal });
  }),
);
```

More: [Policies, `batch`](policies.md#batch-send-many-calls-as-one).

## Features and domain logic

### Get the result of emit

`emit` of a plain event returns nothing, so to get an answer you need a second event. An action with a handler returns the result of its handler right from `emit`.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";

const bus = createBus();

// createAction with a handler — emit runs it and returns what it returns
const double = createAction("math/double", (value) => value * 2);

const result = bus.emit(double(21)); // 42
```

More: [Actions, jobs and modules](actions.md).

### Group a feature with its handlers: modules

A feature has several subscriptions, and you must remember to remove each one. A module registers them together and removes them all with one `unmount`.

```js
import { createBus } from "nanoeffects";
import { createModule, modulePlugin } from "nanoeffects/actions";

// createModule — one feature; unmount cancels everything it registered
const greeting = createModule("greeting", (m) => {
  m.on("greet", (name) => console.log(`hello ${name}`));
});

const bus = createBus();
const app = bus.use(modulePlugin([greeting]));

app.unmount(greeting); // the subscription is gone
```

More: [Modules](actions.md#modules) and [the guide](guide.md#9-mount-a-domain-as-a-module).

### Do not leave subscriptions after a widget closes

A chat widget subscribes to the bus when it opens. If it closes without unsubscribing, the handlers stay: memory grows with every open, and they still update a widget that is gone. A module that you mount on open and unmount on close leaves nothing behind.

```js
import { createBus } from "nanoeffects";
import { createModule, modulePlugin } from "nanoeffects/actions";

// the module owns the listeners of the widget
const chatModule = createModule("chat", (m) => {
  m.on("message/received", (message) => render(message));
});

const bus = createBus();
const app = bus.use(modulePlugin());

const stop = app.mount(chatModule); // the widget is opened: the listeners are on the bus

stop(); // the widget is closed: no listeners are left
console.log(bus.get("message/received").length); // 0
```

More: [Build a chat widget](chat-widget.md).

## Stop work on a server

A client closes the tab, but the server goes on asking other services for it. Create an `AbortController` for the request, abort it when the connection closes, and pass its signal to `emit`: `timeout`, `retry` and the request itself stop.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { signalPlugin } from "nanoeffects/signal";

// signalPlugin — emit accepts { signal }
const bus = createBus().use(signalPlugin());

const getUser = createAction("user/get", (id, { signal }) => api.getUser(id, { signal }));

export async function handleRequest(request, reply) {
  const controller = new AbortController();

  // close — the client left: abort everything started for this request
  reply.raw.on("close", () => controller.abort());

  // the task, and the requests it made, stop with the controller
  return bus.emit(getUser(request.params.id), { signal: controller.signal });
}
```

More: [Stop work on a server](server.md), including WebSocket and queue workers.

## Debugging: what ran and why

An effect fired and you cannot tell which event caused it. The tracer logs every task with its parent, so you see the chain of events.

```js
import { createBus } from "nanoeffects";
import { consoleLogger, createTracer, tracePlugin } from "nanoeffects/trace";

// createTracer — send every task to the console
const trace = createTracer(consoleLogger());

// tracePlugin — also report every emit
const bus = createBus({ trace }).use(tracePlugin());

bus.on("search", (query, ctx) => ctx.emit("results", [query]));
bus.emit("search", "nano"); // the log shows: search · emit, then results · emit with search as the cause
```

More: [Trace tasks](tracing.md). To reload modules without a page refresh, see [Hot reload](hmr.md).

## Test a policy with fake timers

A test of `latest` or `debounce` is full of `advanceTimersByTime` numbers, and nobody can tell from them what the test proves. Write the emits and the phases as diagrams instead.

```js
import { it, vi } from "vitest";
import { latest } from "nanoeffects/policies";
import { createMarbleBus, fakeTimersClock } from "nanoeffects/testing";

// a search that takes 50 ms
function search(query) {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

it("latest cancels the search that is running", async () => {
  vi.useFakeTimers();

  // createMarbleBus: a bus that records its trace; a frame is 10 ms
  const marbles = createMarbleBus({ clock: fakeTimersClock(vi) });
  marbles.bus.on("search/changed", latest(search), { traceId: "search" });

  // "a-b": two emits, at frame 0 and frame 2
  const result = await marbles.run({
    emits: { "search/changed": { marble: "a-b" } },
    frames: 12,
  });

  // s start, c cancel, d done
  result.expect({ "search/changed:latest": "s-(cs)----d----" });
});
```

More: [Test time with diagrams](testing.md).

## Other libraries in the project

- **Redux Toolkit, Zustand, MobX or Pinia.** [Connect a store](stores.md).
- **React Query, SWR or RTK Query.** [Query libraries](query-libraries.md).
- **RxJS.** [Use nanoeffects next to RxJS](migrating-from-rxjs.md) and [Observables](observable.md).
- **Moving from redux-saga.** [Coming from redux-saga](migrating-from-saga.md).
- **Moving from Effector.** [Coming from Effector](migrating-from-effector.md).
- **Moving from mitt or nanoevents.** [Coming from mitt](migrating-from-mitt.md).

## Classes and TypeScript

### Use the bus in a class

Your logic lives in classes, and each instance must remove its subscriptions when it is no longer needed. `Emitter` gives every instance its own bus and a `dispose` that removes all of its subscriptions.

```js
import { Emitter } from "nanoeffects/oop";

// Emitter — every instance gets its own bus with on, once, off, emit and dispose
class VideoService extends Emitter {
  constructor() {
    super();
    this.on("played", () => console.log("playing"));
  }
}

const video = new VideoService();
video.emit("played");

video.dispose(); // removes every subscription of this instance
```

More: [Use the bus from a class](oop.md).

### Keep the types of the bus in many files

Handlers and modules are in different files, and TypeScript must know the payloads and the fields of `ctx`. See [TypeScript in many files](typescript.md).

## Examples of whole apps

- **A form with a username check and a submit, in React.** [Build a sign-up form in React](react.md).
- **A whole app in layers: entities, features, modules, a server.** [Build a chat](chat-example.md).
- **A widget that listens only while it is open.** [Build a chat widget](chat-widget.md).
- **Vue.** [Use nanoeffects in a Vue app](vue.md).
- **Svelte.** [Use nanoeffects in a Svelte app](svelte.md).
- **A ready project.** [Start a project from a template](starter.md).
