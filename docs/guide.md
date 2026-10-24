# Guide

Climb one step at a time: small bus → policies → effects → commands and modules. Stop when your project has what it needs.

| Your project | Stop after |
| ------------ | ---------- |
| Widget / prototype | §1–2 |
| SPA with async UI | §3–4 |
| Unreliable network / long flows | §5–6 |
| Domain logic off the UI | §7–9 |

Runnable code for every step: [`examples/guide.ts`](../examples/guide.ts).

## 1. Create a bus

`on` subscribes. `emit` calls the subscribers. `on` returns the unsubscribe function.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // event bus; each handler call is a task

const unbind = bus.on("greet", (name) => {
  console.log(`hello ${name}`);
});

bus.emit("greet", "Ada"); // hello Ada
unbind();
bus.emit("greet", "Bob"); // nobody listens
```

Handlers run at once, in subscription order.

`bus.once` is like `on`, but the handler runs at most once (it is removed before it is invoked). `bus.off("greet")` clears every listener of that event; `bus.off()` with no arguments clears **every** listener on the bus (including `"*"`). `ctx.off` is the same `off` as the bus’s — so `ctx.off()` also clears the whole bus.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

// once — runs at most once, then unsubscribes
bus.once("ready", () => console.log("ready"));
bus.emit("ready"); // ready
bus.emit("ready"); // nobody listens

bus.on("tick", () => {});
bus.off(); // clear every subscription
```

### Listen to every event

`bus.on("*", fn)` runs for every event of the bus. It is for logging, debugging, or forwarding events elsewhere. The handler gets the payload and the task context as usual, and `ctx.type` is the name of the event.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

// "*" — runs for every event, after the listeners of that event
const unbind = bus.on("*", (payload, ctx) => {
  console.log(ctx.type, payload);
});

bus.emit("greet", "Ada"); // greet Ada
bus.emit("moved", { x: 1, y: 2 }); // moved { x: 1, y: 2 }
unbind();
```

- An event that only `"*"` listens to counts as heard, so `onUnhandled` does not fire for it.
- `bus.off("*")` removes every `"*"` listener; `bus.off()` clears the whole bus, `"*"` included.

## 2. Use the handler context

The second argument is the **task** context for this call. Emit further events through it. Pass `ctx.signal` to `fetch` when you cancel work.

```js
import { createBus } from "nanoeffects";

const bus = createBus();

bus.on("moved", ({ x, y }, ctx) => {
  if (x < 0) {
    ctx.emit("outOfBounds", { x, y });
  }
});
```

`ctx` has `signal`, `abort`, `emit`, `on`, and `run`. An aborted task stops emitting and delivers no result.

## 3. Abort the previous run with `latest`

A handler is often called again before the last call finished (typing, double-clicks). A **policy** wraps the handler and decides what happens then. Start with `latest`: a newer call aborts the older one through `signal`.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// latest — a newer run aborts the older one
bus.on(
  "search",
  latest(async (query, { signal }) => {
    await api.search(query, { signal });
  }),
);
```

Same `on`, same handler shape. More in [Policies](policies.md).

## 4. Pick another policy when overlap differs

| Policy | When calls overlap |
| ------ | ------------------ |
| `latest` | previous call is aborted |
| `leading` | new calls drop while one runs |
| `debounce` | runs after a pause |
| `throttle` | at most once per window |
| `queue` | one after another |

```js
import { createBus } from "nanoeffects";
import { debounce, latest, queue, throttle } from "nanoeffects/policies";

const bus = createBus();

// throttle — at most once per 100 ms
bus.on("scroll", throttle(100, (position) => {
  updateScrollbar(position);
}));

// debounce — run after 300 ms of quiet
bus.on("typed", debounce(300, (text) => {
  validate(text);
}));

// queue — one save after another, in order
bus.on(
  "save",
  queue(async (draft, { signal }) => {
    await api.save(draft, { signal });
  }),
);

// nest: wait for quiet, then keep only the latest search
const searchLatest = latest(async (query, { signal }) => {
  await api.search(query, { signal });
});
bus.on("search", debounce(300, searchLatest));
```

Full options: [Policies](policies.md).

## 5. Add retry and timeout

An **effect** adds what an async handler usually needs. `retry` and `timeout` wrap a handler like a policy, so they go into `on` with no `ctx` in their arguments.

```js
import { createBus } from "nanoeffects";
import { retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

const search = (query, { signal }) => api.search(query, { signal });

// timeout — fail one try after 5 s
const searchOnce = timeout(5000, search);
// retry — up to 3 tries
const searchWithRetry = retry(searchOnce, { times: 3 });

// latest — a newer typed query aborts the whole retry chain
bus.on("typed", latest(searchWithRetry));
```

When the handler itself needs the result, `ctx.run` runs the wrapped function as a child task (aborted with the parent):

```js
import { createBus } from "nanoeffects";
import { retry, timeout } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

const bus = createBus();
const search = (query, { signal }) => api.search(query, { signal });

bus.on(
  "search",
  latest(async (query, ctx) => {
    const load = retry(timeout(5000, search), { times: 3 });
    const items = await ctx.run(load, query); // child task; aborted with this one
    ctx.emit("results", items);
  }),
);
```

For one call in the middle of a body: `await retry(ctx, () => api.search(q, { signal: ctx.signal }))`. More in [Effects](effects.md).

## 6. Run work in parallel or wait for an event

```js
import { createBus } from "nanoeffects";
import { all, take } from "nanoeffects/effects";

const bus = createBus();

// all — run together; one failure cancels the rest
bus.on("search", async (id, ctx) => {
  const { user, posts } = await all(ctx, {
    user: ({ signal }) => api.user(id, { signal }),
    posts: ({ signal }) => api.posts(id, { signal }),
  });
  ctx.emit("loaded", { user, posts });
});

// take — wait for the next event of that name
bus.on("typed", async (query, ctx) => {
  const position = await take(ctx, "scroll");
  ctx.emit("scrolled", { query, position });
});
```

More in [Effects](effects.md).

## 7. Name events three ways

`emit` and `on` take a string, an object `{ type, payload }` (a Redux action fits), or a function with a `type` property (action creators and commands).

From here on the bus is kept in one file and the events in files named after their domain (`move.js`, `math.js`), as in a real app: the events can then be imported anywhere without importing the bus.

```js
// bus.js
import { createBus } from "nanoeffects";

export const bus = createBus();
```

```js
// move.js
import { createAction } from "nanoeffects/actions";

// createAction — names an event; calling it builds { type, payload }
export const moved = createAction("moved");
```

```js
// math.js
import { createCommand } from "nanoeffects/actions";

// createCommand — like an action, but emit runs a handler and returns its result
export const double = createCommand("math/double", (value) => value * 2);
```

```js
import { bus } from "./bus";
import { moved } from "./move";
import { double } from "./math";

bus.emit("moved", { x: 1, y: 2 });
bus.emit({ type: "moved", payload: { x: 2, y: 2 } });

bus.emit(moved({ x: 3, y: 2 }));
bus.on(moved, ({ x }) => console.log(x));

bus.emit(double(21)); // 42
```

Use strings for the plain case. Use objects when other code already builds actions. Use commands when you need a result from `emit`.

## 8. Register a command handler

A command may carry its handler, or only be a **contract** (name + types) with the work registered elsewhere — another file, or a fake in a test.

```js
// user.js
import { createCommand } from "nanoeffects/actions";

export const getUser = createCommand("user/get"); // contract — no handler yet
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { commandsPlugin } from "nanoeffects/actions";

export const bus = createBus();
// commandsPlugin — registry of handlers for this bus
export const commands = bus.use(commandsPlugin());
```

```js
import { bus, commands } from "./bus";
import { getUser } from "./user";

bus.emit(getUser("1")); // throws: No handler for command "user/get"

const unregister = commands.handle(getUser, (id) => api.user(id));
const user = await bus.emit(getUser("1"));

unregister();
```

Each bus has its own registry. A [module](#9-mount-a-domain-as-a-module) can register handlers and remove them on unmount. More in [Actions](actions.md).

## 9. Mount a domain as a module

**Problem.** A feature owns several things on the bus: who answers `getUser`, who listens to `greet`, maybe a command that already carries its handler. With plain `bus.on` / `commands.handle` you must remember every unsubscribe when the feature goes away. Miss one and listeners pile up.

**When.** Domain logic lives on the bus, off the UI, and you need one mount / one unmount for that feature. Skip modules while a few top-level `bus.on` calls are enough.

**What you do.** `createModule(name, setup)` describes the feature. `bus.use(modulePlugin([…]))` mounts it. `app.unmount(module)` undoes everything the setup registered.

```js
// user.js
import { createCommand } from "nanoeffects/actions";

export const getUser = createCommand("user/get"); // contract — no handler yet
```

```js
// math.js
import { createCommand } from "nanoeffects/actions";

export const double = createCommand("math/double", (value) => value * 2); // carries its handler
```

```js
// greeting-module.js
import { createModule } from "nanoeffects/actions";
import { getUser } from "./user";
import { double } from "./math";

// createModule — one feature; name is stable for hot reload replace
export const greeting = createModule("greeting", (m) => {
  // m.on — like bus.on, removed automatically on unmount
  m.on("greet", (name) => console.log(`hello ${name}`));

  // m.handle — this module answers getUser while mounted
  m.handle(getUser, (id) => api.user(id));

  // m.use — register a command that already has a handler, for this module’s life
  m.use(double);
});
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { greeting } from "./greeting-module";

export const bus = createBus();
// modulePlugin — mount modules on the bus
export const app = bus.use(modulePlugin([greeting]));
```

```js
import { app, bus } from "./bus";
import { greeting } from "./greeting-module";

bus.emit("greet", "Ada"); // hello Ada
app.unmount(greeting); // greet listener and getUser binding are gone
```

- **`m.on`** — same job as `bus.on`, scoped to the module’s lifetime.
- **`m.handle`** — bind a handler to a contract command; gone on unmount.
- **`m.use`** — bring a command that already carries a handler (or a sub-module). Prefer `handle` when the handler must die with the feature.

Modules also make [hot reload](hmr.md) work. Full API in [Actions](actions.md); a longer recipe in [`examples/modules.ts`](../examples/modules.ts).

## 10. Add types when you want checking (optional)

Describe events once when you want `on` / `emit` checked. An event without data is `void`. Skip this while you are learning the bus.

```ts
import { createBus } from "nanoeffects";

// Events — event name → payload for this bus (checker only)
type Events = {
  greet: string;
  moved: { x: number; y: number };
  reset: void;
};

const bus = createBus<Events>();

bus.on("moved", ({ x, y }) => console.log(x + y));
bus.emit("moved", { x: 1, y: 2 });
bus.emit("reset");
// bus.emit("moved", { x: "1" }); // error
// bus.emit("jumped", 1); // error
```

Without a map, any string event is allowed and the payload is `unknown`.

## 11. Isolate errors and warn on typos

```js
import { createBus } from "nanoeffects";

const bus = createBus({
  onError: (error) => report(error), // isolate failing handlers
  onUnhandled: ({ type }) => console.warn(`nobody listens to ${type}`),
});
```

More in [Errors](errors.md).

## Where next

| Need | Page |
| ---- | ---- |
| Store or client on every task | [Context fields](context.md) |
| Redux / Zustand / MobX | [Stores](stores.md) |
| Observe tasks | [Tracing](tracing.md) |
| Guarantees | [Semantics](semantics.md) |
| Which import | [Package entries](package.md) |
