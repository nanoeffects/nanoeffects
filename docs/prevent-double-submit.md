# Prevent a double submit

Read this page if a second click on "Pay", "Sign up" or "Save" sends the request twice. It shows how to ignore the second click while the first request runs, how to do it per item, and when to queue the calls instead.

## See the problem

A user clicks twice. Both clicks run the handler, and the server gets two requests.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // the bus: events and handlers

// Without a policy every "submitted" starts its own request.
bus.on("submitted", async (form) => {
  const order = await api.pay(form);
  bus.emit("paid", order);
});
```

A `disabled` button helps only until the next render. A flag in a variable (`if (busy) return`) must be reset on every error path and after an abort.

## Ignore clicks while a request runs

Wrap the handler in `leading`. While one run is going, new calls are dropped. When the run ends, the next click works.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

// leading: a call is dropped while a previous run is still going
bus.on(
  "submitted",
  leading(async (form, ctx) => {
    const order = await api.pay(form, { signal: ctx.signal });
    ctx.emit("paid", order);
  }),
);
```

What to replace: `api.pay` is your own request function.

Result: `emit("submitted", form)` twice in a row sends one request. The second call returns at once and does nothing.

`leading` frees its lock when the task ends or aborts. If the handler throws, the next click works again, with no flag to reset.

## Allow one run per item

A list of rows, each with its own "Delete" button, should not block the whole list. Give each item its own state with `key`.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

// leading with key: one running call per row id, other rows are not blocked
bus.on(
  "row/deleted",
  leading(
    async (row, ctx) => {
      await api.deleteRow(row.id, { signal: ctx.signal });
      ctx.emit("row/removed", row.id);
    },
    { key: (row) => row.id },
  ),
);
```

## Retry only when the network failed

A retry after a failed payment can charge twice if the server did run the first request. Retry only on errors where the request did not reach the server, and make the server accept an idempotency key.

```js
import { createBus } from "nanoeffects";
import { leading } from "nanoeffects/policies";
import { retry } from "nanoeffects/effects";

const bus = createBus(); // the bus: events and handlers

// fetch rejects with a TypeError when the network fails; an HTTP error is a plain Error
const isNetworkError = (error) => error instanceof TypeError;

bus.on(
  "submitted",
  leading(async (form, ctx) => {
    const pay = () => api.pay(form, { signal: ctx.signal });
    // retry: up to 3 tries, 500 ms apart, only when the network failed
    const order = await retry(ctx, pay, { times: 3, delay: 500, shouldRetry: isNetworkError });
    ctx.emit("paid", order);
  }),
);
```

Backoff between tries: [Back off between retries](effects.md#back-off-between-retries).

## Guard a handler when you have no bus

`withPolicy` turns a policy into a plain function, so a click handler needs no bus.

```js
import { leading, withPolicy } from "nanoeffects/policies";

// leading: ignore new calls while a run is going
const policy = leading(async (form, { signal }) => {
  await api.save(form, { signal });
});

// withPolicy: a plain function to call from onSubmit
const submit = withPolicy(policy);

submit({ name: "Ada" }); // runs
submit({ name: "Ada" }); // ignored while the first runs; resolves with undefined
```

In a React component use [`usePolicy`](react.md#keep-a-debounced-handler-between-renders).

## Pick another policy when clicks must not be lost

| You want | Policy |
| -------- | ------ |
| Ignore a second click while the first runs (pay, sign up) | `leading` |
| Run every click, one after another (save a draft, upload files) | `queue` |
| Keep only the newest click and cancel the older (filters, tabs) | `latest` |

Related: [Policies](policies.md), [Build a sign-up form in React](react.md).
