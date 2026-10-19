# Effects and cancellation

Use this page for retry, timeouts, waiting, or parallel work — not as the first page for a small bus. Pick **one** helper for your job; the rest is reference.

An abort only raises a flag. Your code decides to stop. Start with `retry` / `timeout` on a handler (see [Guide §5](guide.md#5-add-retry-and-timeout)).

## Wrap a handler with retry and timeout

`retry`, `timeout`, and `poll` have two forms:

- **Task wrapper** — take a function `(payload, ctx) => result` and return one. Pass them into `on` next to policies (no `ctx` in their arguments).
- **Call inside a body** — take `ctx` first.

The first argument tells them apart: a function (`retry`), a number (`timeout`), or a number/function (`poll`) is a wrapper; an object is `ctx`.

```js
import { createBus } from "nanoeffects";
import { poll, retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();
const loadUser = (id, { signal }) => fetchUser(id, { signal });

// timeout — one try must finish within 5 s
const loadOnce = timeout(5000, loadUser);
// retry — up to 4 attempts with backoff
const loadWithRetry = retry(loadOnce, {
  times: 4,
  delay: (attempt) => 2 ** attempt * 100,
  shouldRetry: (error) => !isFatal(error),
});
// latest — a newer load aborts the older retry chain
bus.on("load", latest(loadWithRetry));

// poll — call refresh every 10 s until the task aborts
bus.on("watch", poll(10_000, (_, { signal }) => refresh({ signal })));

// ctx.run — run a wrapped Task as a child (aborted with the handler)
bus.on("open", async (id, ctx) => {
  const load = retry(timeout(5000, loadUser));
  const user = await ctx.run(load, id);
  ctx.emit("opened", user);
});

// ctx-first form — one call inside a body
bus.on("load", async (id, ctx) => {
  const user = await retry(
    ctx,
    () => fetchUser(id, { signal: ctx.signal }),
    { times: 4 },
  );
  const data = await timeout(ctx, 5000, ({ signal }) => {
    return fetchData(id, { signal });
  });
  await poll(ctx, () => refresh(), 10_000);
  ctx.emit("ready", { user, data });
});
```

Use the wrapper for a whole handler or a whole `ctx.run`. Use the `ctx` form for one call in the middle of a body.

Each attempt or call of a wrapper gets its own child context. Abort of the caller reaches it. Abort of one attempt (a timeout) does not reach the caller. The attempt number is passed only in the `ctx` form.

### Options for retry, timeout, and poll

**`retry`**

- `times` — total attempts (default `3`).
- `delay` — number or `(attempt, error) => ms`.
- `shouldRetry(error, attempt)` — stop early.
- `fn` gets the attempt number starting at `1`.
- On abort, rejects with the abort reason.

**`timeout`**

- Error is a `DOMException` named `TimeoutError` (like `AbortSignal.timeout`).
- Rejects even if the starter ignores its signal.

**`poll`** (like patronum `interval`)

- First call after `ms`. `leading: true` also calls at once.
- Next ticks keep a steady rate whatever the duration of `fn`, so a slow `fn` can overlap the next call.
- `waitForFn: true` starts each pause when the call ends — calls never overlap.
- `fn` gets the call number from `0`.
- An error from `fn` stops polling and rejects. An abort ends it normally and clears the timer.

A pause can be a function wherever a time is given (backoff or jitter):

```js
retry(ctx, load, { times: 5, delay: (attempt) => 2 ** attempt * 100 }); // 200, 400, 800, …
poll(ctx, refresh, (call) => Math.min(1000 * 2 ** call, 60_000)); // slows to once a minute
await delay(ctx, () => 200 + Math.random() * 200); // 200–400 ms
```

All three are traced: the effect is a group (`retry`, `timeout`, `poll`) and each attempt or call is a `run` child.

## Tie a promise to the task signal

`delay(ctx, ms)` waits and rejects on abort (`ms` can be a function).

`cancellable(ctx, executor)` is a promise tied to the task signal. It works like `new Promise`, but the executor gets `{ resolve, reject, onCancel }`.

```js
import { createBus } from "nanoeffects";
import { cancellable } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// cancellable — promise tied to the task signal; onCancel for cleanups
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

- If the task aborts before the promise settles, cleanups run (last registered first) and the promise rejects with the abort reason.
- If the task is already aborted, the executor does not run.
- After the promise settles, the abort listener is removed and cleanups are dropped.

## Run cleanup on abort

`onAbort(ctx, fn)` runs `fn(reason)` on abort (at once if already aborted) and returns a function that unsubscribes.

```js
import { createBus } from "nanoeffects";
import { onAbort } from "nanoeffects/effects";

const bus = createBus();

bus.on("connect", (url, ctx) => {
  const socket = new WebSocket(url);
  // onAbort — run cleanup when this task aborts
  onAbort(ctx, () => socket.close());
});
```

## Wait for the next event with `take`

A task context has `on` and `off`, like the bus. A subscription made with `ctx.on` ends when the task aborts:

```js
import { createBus } from "nanoeffects";

const bus = createBus();

bus.on("watch", (_, ctx) => {
  ctx.on("tick", (n) => console.log(n)); // gone when this task aborts
});
```

- The returned function unsubscribes sooner. After abort, `ctx.on` does nothing.
- Under `latest`, subscriptions of a superseded run end with that run.
- `ctx.off(event)` clears every handler of the event on the bus, not only the task’s.

`take(ctx, event, options?)` waits for the next `event` and resolves with its payload:

```js
import { createBus } from "nanoeffects";
import { take, timeout } from "nanoeffects/effects";

const bus = createBus();

bus.on("login", async (user, ctx) => {
  const reason = await take(ctx, "logout"); // resolves on the next logout
  cleanup(user, reason);

  // wait for a matching event, but not longer than 5 s
  const id = await timeout(ctx, 5000, ({ signal }) =>
    take(ctx, "saved", { signal, predicate: (savedId) => savedId === draft.id }),
  );
});
```

- Sees only events emitted after the call, takes one, and unsubscribes.
- `options.predicate` skips payloads it rejects.
- `options.signal` stops the wait (how a `race` or `timeout` starter cancels it).
- On abort of the task or of `options.signal`, unsubscribes and rejects with the abort reason.

## Run several starters together

`all(ctx, effects)` runs starters together. One failure cancels the rest. Shape of the input (object or array) is preserved in the result.

`allSettled(ctx, effects)` waits for every starter and never fails because of one. Each result is `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`. Nothing is cancelled when a starter fails. Only an abort of `ctx` rejects it.

```js
import { createBus } from "nanoeffects";
import { allSettled } from "nanoeffects/effects";

const bus = createBus();

bus.on("open", async (id, ctx) => {
  const { user, posts } = await allSettled(ctx, {
    user: ({ signal }) => fetchUser(id, { signal }),
    posts: ({ signal }) => fetchPosts(id, { signal }),
  });

  if (user.status === "fulfilled") {
    render(user.value);
  }
});
```

`race(ctx, effects)` settles with the first starter that finishes and cancels the others.

## Pass `ctx` outside a task

Effects that wait inside a body take `ctx` first: `delay`, `all`, `allSettled`, `race`, `cancellable`, `onAbort`, `take`, and the `ctx` forms of `retry` / `timeout` / `poll`. Outside a task, pass `{}` or any object with a `signal`.

For `fetch` and other APIs that take a signal, pass `ctx.signal`. A timeout without `race`: `AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])`.
