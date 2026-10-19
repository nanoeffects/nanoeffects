# Effects and cancellation

An abort only raises a flag: your code decides to stop. `nanoeffects/effects` has helpers for the usual cases.

`delay(ctx, ms)` waits and rejects on abort (`ms` can be a function). `cancellable(ctx, executor)` is a promise tied to the task signal; it works like `new Promise`, but the executor gets one object, `{ resolve, reject, onCancel }`, with `onCancel` for cleanups:

```ts
import { cancellable } from "nanoeffects/effects";

bus.on(
  "wait",
  latest((_, ctx) =>
    cancellable(ctx, ({ resolve, onCancel }) => {
      const timer = setTimeout(resolve, 5000);
      onCancel(() => clearTimeout(timer));
    }),
  ),
);
```

- If the task aborts before the promise settles, cleanups run (last registered first) and the promise rejects with the abort reason.
- If the task is already aborted, the executor does not run.
- After the promise settles, the abort listener is removed and cleanups are dropped.

`onAbort(ctx, fn)` runs `fn(reason)` on abort (at once if already aborted) and returns a function that unsubscribes:

```ts
import { onAbort } from "nanoeffects/effects";

bus.on("connect", (url, ctx) => {
  const socket = new WebSocket(url);
  onAbort(ctx, () => socket.close());
});
```

## allSettled

`allSettled(ctx, effects)` is `all` that waits for every starter and never fails because of one: each result is `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`, in the shape of the input (object or array). Nothing is cancelled when a starter fails. Only an abort of `ctx` rejects it.

```ts
const { user, posts } = await allSettled(ctx, {
  user: ({ signal }) => fetchUser(id, { signal }),
  posts: ({ signal }) => fetchPosts(id, { signal }),
});

if (user.status === "fulfilled") render(user.value);
```

## Subscribing from a task: ctx.on, ctx.off, take

A task context has `on` and `off`, like the bus. A subscription made with `ctx.on` ends when the task aborts, so it cannot outlive the work that needed it:

```ts
bus.on("watch", (_, ctx) => {
  ctx.on("tick", (n) => console.log(n)); // gone when this task aborts
});
```

- The returned function unsubscribes sooner. After the task is aborted, `ctx.on` does nothing.
- A policy passes its handler a child context, so under `latest` the subscriptions of a superseded run end with it.
- `ctx.off` is the bus `off`: `ctx.off(event)` clears every handler of the event, not only the task's.

`take(ctx, event, options?)` waits for the next `event` and resolves with its payload:

```ts
import { take, timeout } from "nanoeffects/effects";

bus.on("login", async (user, ctx) => {
  const reason = await take(ctx, "logout"); // resolves on the next logout
  cleanup(user, reason);

  // wait for a matching event, but not longer than 5 s
  const id = await timeout(ctx, 5000, ({ signal }) =>
    take(ctx, "saved", { signal, predicate: (id) => id === draft.id }),
  );
});
```

- It sees only events emitted after the call, takes one, and unsubscribes.
- `options.predicate` skips payloads it rejects; `options.signal` stops the wait, which is how a `race` or `timeout` starter cancels it.
- On abort of the task or of `options.signal` it unsubscribes and rejects with the abort reason. It is traced as a `take` group.

## retry, timeout, poll

```ts
import { poll, retry, timeout } from "nanoeffects/effects";

bus.on("load", async (id, ctx) => {
  // up to 4 attempts, backoff between them; stops when the task aborts
  const user = await retry(ctx, () => fetchUser(id, { signal: ctx.signal }), {
    times: 4,
    delay: (attempt) => 2 ** attempt * 100,
    shouldRetry: (error) => !isFatal(error),
  });

  // aborts the starter's signal and rejects with a TimeoutError after 5 s
  const data = await timeout(ctx, 5000, ({ signal }) => fetchData(id, { signal }));

  // calls refresh every 10 s; resolves when the task aborts
  await poll(ctx, () => refresh(), 10_000);
});
```

- `retry`: `times` is the total number of attempts (default 3), `delay` is a number or `(attempt, error) => ms`, `shouldRetry(error, attempt)` can stop early. `fn` gets the attempt number, starting at 1. On abort it rejects with the abort reason.
- `timeout`: the error is a `DOMException` named `TimeoutError`, like `AbortSignal.timeout`. It rejects even if the starter ignores its signal.
- `poll`: like patronum `interval`. The first call comes after `ms` (`leading: true` also calls at once), and the next ticks keep a steady rate whatever the duration of `fn`, so a slow `fn` can overlap with the next call; `waitForFn: true` starts each pause when the call ends instead, so calls never overlap. `fn` gets the call number from 0. An error from `fn` stops polling and rejects; an abort ends it normally and clears the timer.
- A pause can be a function wherever a time is given, for backoff or jitter: `retry`'s `delay` gets `(attempt, error)`, `poll`'s `ms` gets the number of the call the pause leads to, and `delay` itself takes a function called once when it starts:

```ts
retry(ctx, load, { times: 5, delay: (attempt) => 2 ** attempt * 100 }); // 200, 400, 800, ...
poll(ctx, refresh, (call) => Math.min(1000 * 2 ** call, 60_000)); // slows down to once a minute
await delay(ctx, () => 200 + Math.random() * 200); // 200 to 400 ms
```

- All three are traced: the effect is a group (`retry`, `timeout`, `poll`) and each attempt or call is a `run` child.

In every effect `ctx` is the first argument: `delay(ctx, ms)`, `all(ctx, effects)`, `allSettled(ctx, effects)`, `race(ctx, effects)`, `cancellable(ctx, executor)`, `onAbort(ctx, fn)`, `retry(ctx, fn, options)`, `timeout(ctx, ms, starter)`, `poll(ctx, fn, ms, options)`, `take(ctx, event, options)`. It is required; outside a task pass `{}` or any object with a `signal`.

For `fetch` and other APIs that take a signal, pass `ctx.signal`. A timeout without `race`: `AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])`.
