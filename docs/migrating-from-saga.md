# Coming from redux-saga

Read this page if you know redux-saga and want to find the same job in nanoeffects. It maps the names, shows one saga rewritten, and lists what has no equivalent. It does not teach the library: start with the [Guide](guide.md).

## Find the equivalent

| redux-saga | nanoeffects |
| ---------- | ----------- |
| `takeEvery` | `bus.on(event, handler)` |
| `takeLatest` | [`latest`](policies.md) |
| `takeLeading` | [`leading`](policies.md) |
| `debounce`, `throttle` | [`debounce`, `throttle`](policies.md) (same rules as lodash) |
| `call(fn, x)` | `await ctx.run(task, x)` |
| `fork(fn, x)` | `ctx.run(task, x)` without `await` |
| `spawn(fn, x)` | `ctx.emit(event, x)` or `bus.emit(event, x)` |
| `put(action)` | `ctx.emit(action)` |
| `take(pattern)` | [`take(ctx, event, { predicate })`](effects.md) |
| `select` | a [context field](context.md), such as `store` |
| `all`, `race` | [`all`, `race`](effects.md) |
| `retry`, `delay` | [`retry`, `delay`](effects.md) |
| `cancel(task)` | `ctx.abort()` on the context, or a newer call under `latest` |
| `eventChannel` | `bus.emitter(action)` as the callback of the subscription |
| `actionChannel` | [`queue`](policies.md) and the other policies |

## Rewrite a saga

A saga that searches on every new query, cancels the older request, and retries a failed one:

<!-- docs-check: skip - redux-saga code, not nanoeffects -->
```js
// redux-saga
function* search({ payload }) {
  const items = yield retry(3, 1000, api.search, payload);
  yield put(found(items));
}
function* watchSearch() {
  yield takeLatest("search", search);
}
```

The same job in nanoeffects:

```js
import { createBus } from "nanoeffects";
import { retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // the bus: events and handlers

const search = (query, { signal }) => api.search(query, { signal });

bus.on(
  "search",
  latest(async (query, ctx) => {
    // latest: a newer "search" aborts this run; ctx.signal is aborted
    const load = retry(search, { times: 3, delay: 1000 }); // retry: up to 3 attempts, 1 s apart
    const items = await ctx.run(load, query); // child task, aborted with this handler
    ctx.emit("found", items); // like put
  }),
);
```

Tasks are plain `async` functions. `ctx.signal` replaces `cancel`: pass it to `fetch` or to your client, and the request stops.

## Start a task without waiting

`fork` and `spawn` differ in what happens when the caller is aborted. Pick by that.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // the bus: events and handlers

const loadSidebar = (_, { signal }) => api.sidebar({ signal });

bus.on("page-opened", async (_, ctx) => {
  // like fork: a child of this task, aborted with it
  const warmUp = ctx.run(loadSidebar);
  warmUp.catch(console.error); // nobody awaits it, so handle the error here

  // like spawn: a new task, not stopped when this one is aborted
  ctx.emit("analytics", { page: "home" });
});
```

## What is different

- **Errors go up only through `await`.** `await ctx.run(task)` and `all(ctx, …)` throw the error of a child to the caller. A child that nobody awaits does not abort its parent, as a forked child does in redux-saga: handle it yourself, as above. See [Errors](errors.md).
- **Abort goes down.** Aborting a task aborts its children. A child does not abort its siblings.
- **Effects are not data.** `yield call(fn)` returns a description that a test can compare. Here `await` calls the function. Test with the real handler and fake timers, as the tests of this library do.
- **No generators.** Sequential flows are `async` functions with `await take(ctx, event)`.
- **No `END` of a channel.** A task stops when its signal aborts.
- **One payload.** A task has one argument, so pass an object where a saga passes several.
