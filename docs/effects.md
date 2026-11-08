# Effects and cancellation

> **Level C.** Read first: [Policies](policies.md).

Use this page for retry, timeouts, waiting, parallel work, or a rollback — not as the first page for a small bus. Pick **one** effect for your job; the rest is reference.

An abort only raises a flag. Your code decides to stop. Start with `retry` / `timeout` on a handler (see [Guide §5](guide.md#5-add-retry-and-timeout)).

## Effects

Every effect below has its own section with its forms, options and an example. `ctx` is the context of the task.

- [`retry`](#retry) — repeat a call after an error.
- [`timeout`](#timeout) — stop a call that takes too long.
- [`poll`](#poll) — call a function at an interval.
- [`backoff`](#backoff) — make the pause between retries grow.
- [`delay`](#delay) — wait for a time; an abort ends the wait.
- [`cancellable`](#cancellable) — a Promise tied to the task signal, for callbacks and timers.
- [`onAbort`](#onabort) — run code when the task is aborted.
- [`ctx.on` and `ctx.off`](#ctxon-and-ctxoff) — subscribe to the bus inside a task.
- [`take`](#take) — wait for the next event inside a handler.
- [`all`](#all) — run several calls together; one failure cancels the rest.
- [`allSettled`](#allsettled) — wait for all of them, whatever the outcome.
- [`race`](#race) — take the first result and cancel the rest.
- [`transaction`](#transaction) — run steps, and roll the finished ones back when a later one fails.
- [`effectsPlugin`](#effectsplugin) — short forms of effects: call them without `ctx`.
- [Effects outside a task](#effects-outside-a-task) — call effects where there is no handler.

## `retry`

Runs a function again after an error. Use it when a call fails now and then, for example because of the network.

Forms:

- `retry(fn, options?)` — a wrapper of a handler: takes a function `(payload, ctx) => result` and returns one. Pass it to `on` next to policies.
- `retry(ctx, fn, options?)` — a call inside the body of a handler.

Options:

- `times` — total attempts. It is `3` by default.
- `delay` — a number or a function `(attempt, error) => ms`. For a growing pause see [`backoff`](#backoff).
- `shouldRetry(error, attempt)` — return `false` to stop early.
- `fn` gets the attempt number, starting at `1`.
- On abort, `retry` rejects with the abort reason.

```js
import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();
const loadUser = (id, { signal }) => fetchUser(id, { signal });

// retry — a wrapper of the handler: up to 4 attempts, but not after a fatal error
const loadWithRetry = retry(loadUser, {
  times: 4,
  shouldRetry: (error) => !isFatal(error),
});

// latest — a newer load aborts the older chain of attempts
bus.on("load", latest(loadWithRetry));

// ctx.run — run the wrapped function as a child task (aborted with the handler)
bus.on("open", async (id, ctx) => {
  const user = await ctx.run(loadWithRetry, id);
  ctx.emit("opened", user);
});
```

Use the wrapper for a whole handler or a whole `ctx.run`. Each attempt gets its own child context: an abort of the caller reaches it, and an abort of one attempt does not reach the caller. For one call in the middle of a body use the form with `ctx`:

```js
import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("load", async (id, ctx) => {
  // retry with ctx — one call inside the body
  const user = await retry(
    ctx,
    () => fetchUser(id, { signal: ctx.signal }),
    { times: 4 },
  );

  ctx.emit("loaded", user);
});
```

## `timeout`

Rejects when the work takes longer than the time you set, and aborts it. Use it when a request can hang.

Forms:

- `timeout(ms, handler)` — a wrapper of a handler.
- `timeout(ctx, ms, fn)` — a call inside a body; `fn` gets the context of its own child task.

The error is a `DOMException` named `TimeoutError` (like `AbortSignal.timeout`). `timeout` rejects even if the function ignores its signal.

```js
import { createBus } from "nanoeffects";
import { timeout } from "nanoeffects/effects";

const bus = createBus();
const loadUser = (id, { signal }) => fetchUser(id, { signal });

// timeout — a wrapper of the handler: it must finish within 5 s
bus.on("load", timeout(5000, loadUser));

bus.on("open", async (id, ctx) => {
  // timeout with ctx — one call inside the body; child carries the signal of the request
  const data = await timeout(ctx, 5000, (child) => fetchData(id, child));
  ctx.emit("opened", data);
});
```

## `poll`

Calls a function again and again at an interval, until the task is aborted. Use it to refresh data every N seconds. It is like `interval` in patronum.

Forms:

- `poll(ms, fn, options?)` — a wrapper of a handler.
- `poll(ctx, fn, ms)` — a call inside a body.

Options:

- The first call happens after `ms`. `leading: true` also calls at once.
- The next ticks keep a steady rate whatever the duration of `fn`, so a slow `fn` can overlap the next call. `waitForFn: true` starts each pause when the call ends, so calls never overlap.
- `fn` gets the call number, starting at `0`.
- An error from `fn` stops polling and rejects. An abort ends it normally and clears the timer.

```js
import { createBus } from "nanoeffects";
import { poll } from "nanoeffects/effects";

const bus = createBus();

// poll — a wrapper of the handler: call refresh every 10 s until the task aborts
bus.on("watch", poll(10_000, (_, { signal }) => refresh({ signal })));

bus.on("sync", async (_, ctx) => {
  // poll with ctx — the same inside a body
  await poll(ctx, () => refresh(), 10_000);
});
```

`retry`, `timeout` and `poll` are traced: the effect is a group, and each attempt or call is a `run` child.

## `backoff`

Makes the pause between retries grow, with a cap and jitter. Use it when a server or network fails under load: retrying at once, or at the same fixed pause, sends every client back at the same moment and can keep the server down. `backoff(options)` returns a function `(attempt) => ms`.

The shortest form is a `delay` function. It needs no import:

```js
import { retry } from "nanoeffects/effects";

const loadWithRetry = retry(loadUser, {
  times: 5,
  delay: (attempt) => 2 ** attempt * 100, // 200, 400, 800, 1600 ms
});
```

When you also want a cap and jitter, build the function with `backoff`:

```js
import { backoff, retry } from "nanoeffects/effects";

const loadWithRetry = retry(loadUser, {
  times: 5,
  // backoff — pause 200, 400, 800, … ms, never over 5 s, a random part of it
  delay: backoff({
    base: 200,
    max: 5000,
    jitter: true,
  }),
});
```

| Option | Meaning |
| ------ | ------- |
| `base` | pause before the second attempt, in ms (default `100`) |
| `factor` | each pause is this many times longer (default `2`) |
| `max` | longest pause, in ms (default none) |
| `jitter` | `true` picks a random pause from 0 up to the computed one (default `false`) |

- With `jitter: true` a pause can be close to 0, so treat `base` as a scale, not a minimum.
- `retry` counts attempts from 1. `poll` counts calls from 0, so with `poll` the first pause is `base / factor`.
- The result is a plain function `(attempt) => ms`, so it also fits `delay(ctx, …)`.

A pause can be a function wherever a time is given:

```js
import { createBus } from "nanoeffects";
import { delay, poll, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("sync", async (_, ctx) => {
  retry(ctx, load, { times: 5, delay: (attempt) => 2 ** attempt * 100 }); // 200, 400, 800, …
  poll(ctx, refresh, (call) => Math.min(1000 * 2 ** call, 60_000)); // slows to once a minute
  await delay(ctx, () => 200 + Math.random() * 200); // 200–400 ms
});
```

## `delay`

Waits for the given time and rejects on abort. A plain `setTimeout` would go on after the task is aborted; `delay` ends the wait at once and clears the timer. `delay(ctx, ms)`, where `ms` can be a function.

```js
import { createBus } from "nanoeffects";
import { delay } from "nanoeffects/effects";

const bus = createBus();

bus.on("saved", async (_, ctx) => {
  // delay — wait 3 s; an abort ends the wait at once and clears the timer
  await delay(ctx, 3000);
  ctx.emit("toast/hidden");
});
```

## `cancellable`

A Promise tied to the task signal. Use it for APIs that work with callbacks, timers or listeners: the signal cannot stop them by itself, so `cancellable` rejects the Promise on abort and runs your cleanup. `cancellable(ctx, executor)` works like `new Promise`, but the executor gets `{ resolve, reject, onCancel }`.

```js
import { createBus } from "nanoeffects";
import { cancellable } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// cancellable — a Promise tied to the task signal; onCancel registers a cleanup
// latest — a newer wait aborts the older timer
bus.on(
  "wait",
  latest((_, ctx) => {
    return cancellable(ctx, ({ resolve, onCancel }) => {
      const timer = setTimeout(resolve, 5000);
      onCancel(() => clearTimeout(timer));
    });
  }),
);
```

- If the task aborts before the Promise settles, cleanups run (last registered first) and the Promise rejects with the abort reason.
- If the task is already aborted, the executor does not run.
- After the Promise settles, the abort listener is removed and cleanups are dropped.

## `onAbort`

Runs code when the task is aborted: a hook of the life of the task. A task may be aborted because the user left or a newer call replaced it, and whatever it opened (a socket, a timer, a listener) must be closed then. `onAbort(ctx, fn)` runs `fn(reason)` on abort (at once if the task is already aborted) and returns a function that unsubscribes.

```js
import { createBus } from "nanoeffects";
import { onAbort } from "nanoeffects/effects";

const bus = createBus();

bus.on("connect", (url, ctx) => {
  const socket = new WebSocket(url);
  // onAbort — close the socket when this task aborts
  onAbort(ctx, () => socket.close());
});
```

## `ctx.on` and `ctx.off`

Subscribes to the bus inside a task. A task context has `on` and `off`, like the bus, and a subscription made with `ctx.on` ends when the task aborts.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

bus.on("watch", (_, ctx) => {
  // gone when this task aborts
  const stop = ctx.on("tick", (n) => console.log(n));

  // or end it sooner yourself: stop() unsubscribes
  ctx.on("watch/closed", stop);
});
```

Be careful with it:

- **A task that finishes by itself is not aborted**, so its `ctx.on` subscription stays. When the work is done, unsubscribe with the function that `ctx.on` returns, or call `ctx.abort()`.
- To wait for **one** event, use [`take`](#take): it unsubscribes by itself.
- For listeners that live as long as a feature, use a [module](actions.md#modules): `unmount` removes all of them.

Also:

- After an abort, `ctx.on` does nothing.
- Under `latest`, the subscriptions of a superseded run end with that run.
- `ctx.off(event)` clears every handler of the event on the bus, not only the ones of this task.

## `take`

Waits for the next event of the bus inside a handler and resolves with its payload. `take(ctx, event, options?)`. The `event` is the name of an event or an action creator, as for `bus.on`.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";
import { take, timeout } from "nanoeffects/effects";

const bus = createBus();
const stopRequested = createAction("stop"); // an event with a name; calling it builds the action

bus.on("login", async (user, ctx) => {
  const reason = await take(ctx, "logout"); // resolves on the next logout
  cleanup(user, reason);

  // an action creator works the same, and its payload type is the type of the result
  const stopped = await take(ctx, stopRequested);
  console.log(stopped);

  // wait for a matching event, but not longer than 5 s
  const id = await timeout(
    ctx,
    5000,
    take("saved", { predicate: (savedId) => savedId === draft.id }), // take without ctx — a ready-made function for the group
  );
});
```

- It sees only events emitted after the call, takes one, and unsubscribes.
- With an action creator the result has the payload type of the creator. A creator made without a payload type (`createAction("saved")`) takes it from the event map of the bus.
- `options.predicate` skips payloads it rejects. In TypeScript, a type guard (`(payload): payload is Admin`) narrows the type of the result.
- `options.signal` stops the wait. Inside `race`, `all` or `timeout` you do not need it: the group already stops the wait, so write `take("saved")` without options.
- On abort of the task or of `options.signal`, it unsubscribes and rejects with the abort reason.

## `all`

Runs several calls together; one failure cancels the rest. Use it to load several things at once. `all(ctx, effects)` takes an object or an array of functions, and the result keeps that shape.

```js
import { createBus } from "nanoeffects";
import { all } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  // all — run both requests together; one failure cancels the other. child is the context of its own request
  const { user, posts } = await all(ctx, {
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });

  ctx.emit("opened", { user, posts });
});
```

Every function of the group gets `child`, the context of its own child task. Pass `child` as the first argument to any effect, as a handler passes `ctx`: when the group ends or fails, `child` is aborted and stops exactly this effect. If your API takes the signal in its options, `child` has a `signal`, so pass it as the options: `(child) => fetchUser(id, child)` (`fetch` reads only `signal` from it). The same holds for `allSettled`, `race` and `timeout`.

**Limit how many run at once.** `all` and `allSettled` start everything together. Over a long list that is a burst of requests. Pass `{ concurrency }` as the third argument (the second in the form without `ctx`, see below) and at most that many run at a time; the next one starts when a running one settles:

```js
import { createBus } from "nanoeffects";
import { all, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("sync", async (ids, ctx) => {
  // all with concurrency — 5 loads at a time, results in the order of ids
  const users = await all(
    ctx,
    ids.map((id) => retry(() => loadUser(id), { times: 2 })),
    { concurrency: 5 },
  );

  render(users);
});
```

The result has the same order and shape as without the option. If one call of `all` fails, the running ones are cancelled and the waiting ones are never started. `allSettled` goes on after a failure. When `ctx` aborts, both stop and start nothing more. A value that is not a positive integer (`0`, `-1`, `NaN`, `1.5`) throws a `RangeError` before anything starts; `Infinity` means no limit. `race` has no `concurrency`: it ends at the first result, so a call that waited for a free slot would never run.

The group without `ctx` takes the options as its second argument, so a limited group can sit inside another group:

```js
import { createBus } from "nanoeffects";
import { all, delay, race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("sync", async (ids, ctx) => {
  const loads = ids.map((id) => retry(() => loadUser(id), { times: 2 }));

  const result = await race(ctx, {
    // all without ctx, with options — 2 loads at a time inside the race
    loaded: all(loads, { concurrency: 2 }),
    // delay without ctx — if it wins, the limited group above is cancelled
    waited: delay(5000),
  });

  if ("loaded" in result) {
    render(result.loaded);
  }
});
```

## `allSettled`

Waits for every call and never fails because of one. Use it when a partial answer is better than none. `allSettled(ctx, effects)`. Each result is `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`. Nothing is cancelled when a call fails; only an abort of `ctx` rejects it.

```js
import { createBus } from "nanoeffects";
import { allSettled } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  // allSettled — wait for both, whatever the outcome
  const { user, posts } = await allSettled(ctx, {
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });

  if (user.status === "fulfilled") {
    render(user.value);
  }
});
```

## `race`

Settles with the first call that finishes and cancels the others. Use it to take the fastest answer or to cut a wait short. `race(ctx, effects)`.

```js
import { createBus } from "nanoeffects";
import { delay, race, take } from "nanoeffects/effects";

const bus = createBus();

bus.on("save", async (draft, ctx) => {
  // race — the first to finish wins, the other is cancelled
  const result = await race(ctx, {
    waited: delay(1000), // delay without ctx — a ready-made function for the group: race gives it its own child
    cancelled: take("cancel"), // take without ctx — the same, waits for the next "cancel"
  });

  if ("waited" in result) {
    ctx.emit("saved", draft);
  }
});
```

**`delay` and `take` without `ctx` are ready-made functions for a group.** In a group, `delay(1000)` and `take("cancel")` do what `(child) => delay(child, 1000)` and `(child) => take(child, "cancel")` do: the group calls them with the child, so the wait stops with the group. Use this form inside `race`, `all`, `allSettled` and `timeout`; use `delay(ctx, 1000)` in plain handler code. They wait only when a group calls them: `await delay(1000)` on its own does not wait, because it is a function, not a Promise. In TypeScript, one kept in a variable outside a group does not know the events of your bus; name them yourself: `const cancelled: StarterOf<Events> = take("cancel")` (`StarterOf` is exported by `nanoeffects/effects`).

The wrapper form of `retry`, `timeout` and `poll` works in a group too: the group calls it with the child, and the function you wrap gets `undefined` as its payload and the child as its context. Write the data it needs into a closure:

```js
import { createBus } from "nanoeffects";
import { delay, race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const result = await race(ctx, {
    // retry without ctx — up to 3 attempts, each with the signal of the child
    user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }),
    // delay without ctx — the loser is cancelled when the other one finishes
    waited: delay(5000),
  });

  if ("user" in result) {
    render(result.user);
  }
});
```

So `retry`, `timeout` and `poll` have three call forms: with `ctx`, as a Task for `bus.on` and `ctx.run`, and inside a group. The arguments tell them apart: a context first is the `ctx` form; a function called with a payload and a context is a Task; the same function called by a group with one argument, its child, is the group form. This does not depend on how many parameters your function declares.

**`all`, `allSettled` and `race` without `ctx` also work in a group**, so a group nests in another group with no wrapper. Load two things, but give up after five seconds:

```js
import { createBus } from "nanoeffects";
import { all, delay, race, retry } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const result = await race(ctx, {
    // all without ctx — loads both, each with up to 3 attempts
    loaded: all({
      user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }),
      posts: retry((_, { signal }) => fetchPosts(id, { signal }), { times: 3 }),
    }),
    // delay without ctx — when it wins, the whole `all` above is cancelled
    waited: delay(5000),
  });

  if ("loaded" in result) {
    render(result.loaded.user, result.loaded.posts);
  }
});
```

`all(effects)` returns a function for a group, `all(ctx, effects)` runs the group. `race` tells them by the count: one argument is the short form, two are the form with `ctx`. `all` and `allSettled` take options in the short form too, `all(effects, { concurrency: 5 })`, so they tell a call of two arguments by its first one: a context is not an array and has an object `signal` (a task context, an `AbortController`, `{ signal }`) or is `{}`; anything else is the effects. Pass a context as an object with a `signal`, or `{}`; an object with functions and no `signal` is read as effects. The inner group stops with the outer one and cancels its own calls. Passing only a context, `all(ctx)`, is a mistake and throws a `TypeError` at once. `race` has no options, because it ends at the first result. In TypeScript, a group kept in a variable outside a group needs a type: `StarterOf<Events>`, or `StarterOf<Events, Result>` when you need its value.

## `transaction`

Runs steps one after another, each with a `rollback`. If a step fails or the task is aborted, it takes back the steps that already finished. Use it for a flow that must not stop halfway: create an order, charge the card, reserve the stock. If the stock call fails, the card is refunded and the order is cancelled.

Without it, a handler keeps a list of undo functions by hand. That is easy to get wrong when the task is aborted: the undo must still run, the abort must not cut it, and a handler that a newer call replaced must not look finished before its undo is done. `transaction` does these three things.

This is a list of steps in memory. It is not a database transaction, there is no isolation, and it does not survive a closed tab or a crash: a rollback that did not run is lost.

```js
import { createBus } from "nanoeffects";
import { transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("checkout", async (order, ctx) => {
  // transaction — a function: call step for each part of the flow; if one fails, roll back the finished steps
  const result = await transaction(ctx, async (step) => {
    // step — run the work as a step; the second argument takes it back and gets what run returned
    const placed = await step(
      // run — does the work; child is the context of this step, so it has a signal
      ({ signal }) => api.createOrder(order, { signal }),
      // rollback — gets what run returned, and no signal
      (placed) => api.cancelOrder(placed.id),
    );

    // the value of a step is a variable: this step reads placed.id
    const payment = await step(
      ({ signal }) => api.charge(placed.id, { signal }),
      (payment) => api.refund(payment.id),
    );

    await step(
      ({ signal }) => api.reserveStock(placed.id, { signal }),
      (reservation) => api.releaseStock(reservation.id),
    );

    return { orderId: placed.id, paymentId: payment.id };
  });

  ctx.emit("checkoutDone", result);
});
```

`step(run, rollback)` runs `run`, waits for its value and gives it to you. If you call `step` a second time, the first step has finished, so the value of one step is a plain variable for the next one (`placed.id` above). The result of `transaction` is what the function returns.

This is why the transaction is a function and not a list: a list of steps is data, and a step in it cannot read what an earlier one returned. In TypeScript each `rollback` gets the type of the value of its own `run`, with no annotation.

**Step options and no rollback.** `step(run, rollback, options)` takes the options of the step as the third argument (see [Choose the rollback strategy](#choose-the-rollback-strategy)). A step with nothing to take back passes `null` for `rollback`: `step(run, null, { rollbackOn: "abort" })`.

**Steps as data.** When the list of steps is built at run time, or shared between callers, give the steps as arguments or as an array. They do the same as the function. `transaction(ctx, first, second)` takes the steps one by one; `transaction(ctx, steps)` takes an array. Only the first lets TypeScript check each `rollback` against what its `run` returned. In the first form the options go before the steps, `transaction(ctx, options, first, second)`, and `null` means none; in the array form they are the last argument. The result of these forms is the array of what each `run` returned, in the order of the steps.

```js
import { createBus } from "nanoeffects";
import { transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("checkout", async (order, ctx) => {
  // transaction — the same flow as steps in an array; the result is the array of their values
  const [orderId, paymentId] = await transaction(ctx, [
    {
      run: ({ signal }) => api.createOrder(order, { signal }),
      rollback: (orderId) => api.cancelOrder(orderId),
    },
    {
      run: ({ signal }) => api.charge(order, { signal }),
      rollback: (paymentId) => api.refund(paymentId),
    },
  ]);

  ctx.emit("checkoutDone", { orderId, paymentId });
});
```

**What is rolled back.** Only the steps whose `run` returned, and the step that failed is not one of them: the library cannot know how far it got, so a step is atomic or cleans up inside its own `run`. A step with no `rollback` is skipped. A step that ignores its signal and returns after an abort counts as finished and is rolled back, because its work happened. `rollback` gets no abort signal, so the abort that started a rollback does not cut it.

A step that may fail halfway cleans up after itself. Give the request a key you can use to cancel it, and cancel it in `catch`:

```js
import { createBus } from "nanoeffects";
import { transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("checkout", async (order, ctx) => {
  await transaction(ctx, async (step) => {
    await step(
      async ({ signal }) => {
        const key = crypto.randomUUID();
        try {
          return await api.charge(order, { key, signal });
        } catch (error) {
          // the step failed, so it is not rolled back: cancel what may have reached the server, then rethrow
          await api.cancelCharge(key);
          throw error;
        }
      },
      (payment) => api.refund(payment.id),
    );
  });
});
```

If the function catches the error of a step and returns, nothing is rolled back: the transaction did not fail. Steps that run at the same time (`Promise.all`) are rolled back in the order they finished, last finished first.

**What you get back.** After the last rollback the result rejects with the error of the failed step (or of the function), or with the abort reason, as every other effect does. If a rollback failed too, it rejects with an `AggregateError`: the first of its `errors` is why the transaction failed, the rest are the rollbacks that failed.

```js
import { createBus } from "nanoeffects";
import { transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("checkout", async (order, ctx) => {
  const steps = [
    {
      run: ({ signal }) => api.charge(order, { signal }),
      rollback: (paymentId) => api.refund(paymentId),
    },
    { run: ({ signal }) => api.reserveStock(order, { signal }) },
  ];

  try {
    await transaction(ctx, steps);
  } catch (error) {
    if (error instanceof AggregateError) {
      // errors[0] is why it failed; the others are rollbacks that failed too
      report(error.errors);
    }
    throw error;
  }
});
```

The result settles only after the last rollback has finished. A `queue` handler therefore frees its slot after the rollback. `latest` does not wait for the handler it replaces, so the rollback of the old call and the first steps of the new one can overlap: use `queue` when they must not.

### Choose the rollback strategy

Three options set the strategy. Give them in the options (the last argument of the function and of the array form, before the steps otherwise) for every step, or in a step for that step alone (the third argument of `step`); the step wins. `null` and a missing option fall back to the next level.

| Option | Values (the first is the default) | In a step | In the options |
| --- | --- | --- | --- |
| `rollbackOn` | `"both"`, `"error"`, `"abort"` | yes | yes |
| `rollbackFailure` | `"continue"`, `"stop"` | yes | yes |
| `rollbackOrder` | `"reverse"`, `"parallel"` | no | yes |

- `rollbackOn` says when a step is rolled back: when a step failed (`"error"`), when the task was aborted (`"abort"`), or in both cases.
- `rollbackFailure` says what happens after a rollback fails: the rollbacks that are left still run (`"continue"`), or none of them does (`"stop"`). The errors are collected either way.
- `rollbackOrder` says how the rollbacks run: one at a time, last step first (`"reverse"`), or all at once (`"parallel"`). It is not a step option because it describes the whole rollback.

```js
import { createBus } from "nanoeffects";
import { transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("checkout", async (order, ctx) => {
  await transaction(ctx, async (step) => {
    await step(
      ({ signal }) => api.createOrder(order, { signal }),
      (placed) => api.cancelOrder(placed.id),
      // rollbackOn in the options of a step — cancel the order only when a step failed; an abort leaves it for the user to resume
      { rollbackOn: "error" },
    );

    await step(
      ({ signal }) => api.charge(order, { signal }),
      (payment) => api.refund(payment.id),
      // rollbackFailure in the options of a step — if the refund fails, do not go on: the order stays, so someone can see it was paid
      { rollbackFailure: "stop" },
    );
  });
});
```

Independent steps can roll back at once. `rollbackFailure: "stop"` has nothing to stop in a parallel rollback, so the combination throws a `TypeError` before the first step starts. A value that is not in its list throws a `RangeError` there too. The function form checks the options of the transaction before it calls your function, but the options of a step when `step` is called, because the steps do not exist before that: a typo in a late step shows after the earlier ones have run, and they are rolled back. TypeScript reports such a typo when you write it.

```js
import { createBus } from "nanoeffects";
import { transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("upload", async (files, ctx) => {
  const steps = files.map((file) => ({
    run: ({ signal }) => api.upload(file, { signal }),
    rollback: (url) => api.deleteFile(url),
  }));

  // rollbackOrder in the options — delete the uploaded files all at once, not one after another
  await transaction(ctx, steps, { rollbackOrder: "parallel" });
});
```

### Retry a rollback

There is no retry option: `rollback` is a plain function of the value, so you wrap it in the `retry` you already know. Pass `{}` as its context. A rollback has no task signal on purpose, so nothing cuts the attempts.

```js
import { createBus } from "nanoeffects";
import { retry, transaction } from "nanoeffects/effects";

const bus = createBus();

// retry with {} — up to 3 attempts to refund; {} means no signal, so an abort does not stop them
const refundWithRetry = (paymentId) =>
  retry({}, () => api.refund(paymentId), { times: 3 });

bus.on("checkout", async (order, ctx) => {
  await transaction(ctx, async (step) => {
    await step(({ signal }) => api.charge(order, { signal }), refundWithRetry);
    await step(({ signal }) => api.reserveStock(order, { signal }));
  });
});
```

Make a rollback safe to call twice: a request may have reached the server before the connection broke. Give the calls inside it their own time limit too (`timeout`), because the result waits for the rollback and a hanging one keeps the handler pending.

### Inside a group, and in TypeScript

`transaction(body, options)` with no `ctx` is a function for a group, as `all` and `race` take: when the group fails, it aborts the transaction and the finished steps are rolled back. The same goes for the other forms: `transaction(options, first, second)`, with the options in front, and `transaction(steps, options)`, with them last. The first argument tells the forms apart: a function is the body of the function form, an object with a `run` is a step, an array is the array form, an object whose `signal` is an object (a task context, an `AbortController`, `{ signal }`) is a context, and any other object, `{}` too, is the options. After a context, a function is the body: `transaction(ctx, body)` and `transaction({}, body)`, which runs outside a task with no signal. To run the other forms outside a task, use the array form, `transaction({}, steps)`.

```js
import { createBus } from "nanoeffects";
import { all, transaction } from "nanoeffects/effects";

const bus = createBus();

bus.on("checkout", async (order, ctx) => {
  // all — run the payment and the check together; if the check fails, the payment steps are rolled back
  const { paid } = await all(ctx, {
    // transaction without ctx — a function for the group; the options work here too
    paid: transaction(
      async (step) => {
        const payment = await step(
          ({ signal }) => api.charge(order, { signal }),
          (payment) => api.refund(payment.id),
        );

        return payment;
      },
      // the options go after the body
      { rollbackOrder: "parallel" },
    ),
    checked: ({ signal }) => api.checkFraud(order, { signal }),
  });

  ctx.emit("paid", paid);
});
```

With [`effectsPlugin`](#effectsplugin), `effectsPlugin({ transaction })` gives `ctx.transaction(body, options)`, `ctx.transaction(first, second)`, `ctx.transaction(options, first, second)` and `ctx.transaction(steps, options)`.

In TypeScript the function form gives what your function returns, and `step` gives the type its `run` returns: the data between steps and the value of each `rollback` are typed with no annotation. In the other forms the result is a tuple of what each `run` returns. With the steps as arguments, TypeScript also infers the value of `rollback` from `run` of the same step: `rollback: (orderId) => api.cancelOrder(orderId)` gets a `string` when `run` returns a `string`. In the array form it cannot, so the value is `any`; write the type where you want it checked: `rollback: (orderId: string) => api.cancelOrder(orderId)`. A key that a step does not have, such as `rollbackOrder` in a step, is not an error, and the step ignores it.

## `effectsPlugin`

Short forms of effects: `effectsPlugin(effects)` puts chosen effects on `ctx`, so a handler calls them without passing `ctx` around. Use it when many handlers call the same helpers, to cut the boilerplate. A handler destructures them like `signal`. Only the effects you pass are imported, so the rest stay out of the bundle ([package entries](package.md)).

```js
import { createBus } from "nanoeffects";
import { all, delay, effectsPlugin, race } from "nanoeffects/effects";

// effectsPlugin — add race, all and delay to the context of every task
const effects = effectsPlugin({ race, all, delay });

// use returns the same bus, typed with the new fields
const bus = createBus().use(effects);

bus.on("load", async (id, { race, all, delay }) => {
  // race — same as race(ctx, …)
  const result = await race({
    data: (child) => fetchData(id, child),
    // a group function gets its own child with the same bound effects, so delay(5000) stops with the race
    timeout: ({ delay }) => delay(5000),
  });
  if ("timeout" in result) throw new Error("timed out");

  // all — same as all(ctx, …)
  const { user, posts } = await all({
    user: (child) => fetchUser(id, child),
    posts: (child) => fetchPosts(id, child),
  });
});
```

- The key is the name the effect gets on `ctx`. `race`, `all`, `allSettled`, `take`, `delay` and `transaction` are typed by hand.
- Your own function works too if its first parameter is `{ signal }` (an *effect*): `effectsPlugin({ fetchJson })` gives `ctx.fetchJson(url)`. TypeScript removes the first parameter from its type; for a generic function see [keep a generic effect generic](context.md#keep-a-generic-effect-generic).
- Leave `retry`, `timeout` and `poll` out: bound to the task they would look like their handler wrappers.
- Fields from `createBus({ context })` stay. TypeScript rejects an effect whose name is already a context field of the bus, including one added by an earlier `effectsPlugin`.
- The free forms keep working: `race(ctx, …)`.

## Effects outside a task

Effects take `ctx` first. Inside a handler it is the `ctx` you already have. Outside a task (in a plain function, a script or a test) there is no `ctx`: pass an object with a `signal`, or `{}` if you never abort.

```js
import { delay, retry } from "nanoeffects/effects";

const controller = new AbortController();

// outside a task there is no ctx: an object with a signal is enough
const context = { signal: controller.signal };

// the effects take it as ctx; fetchUser gets the same signal, so the request itself stops too
const user = await retry(
  context,
  () => fetchUser("1", { signal: controller.signal }),
  { times: 3 },
);

await delay(context, 500);

// stops the pending retries and waits
controller.abort();
```
