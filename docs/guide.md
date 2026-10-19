# Guide

From a bus with two calls to an app with modules, one step at a time. Every step builds on the one before, and the code is in [`examples/guide.ts`](../examples/guide.ts), where it is type-checked and run by a test.

## 1. A bus

`on` subscribes, `emit` calls the subscribers, and `on` returns the function that unsubscribes, as in nanoevents.

```ts
import { createBus } from "nanoeffects";

const bus = createBus();

const unbind = bus.on("greet", (name) => console.log(`hello ${name}`));

bus.emit("greet", "Ada"); // hello Ada
unbind();
bus.emit("greet", "Bob"); // nobody listens now
```

The handlers run at once, in the order they subscribed. That is all a bus is; the rest of the guide is what you can put on top.

## 2. Types

Describe the events once, and `on` and `emit` are checked. An event without data is `void`.

```ts
type Events = {
  greet: string;
  moved: { x: number; y: number };
  reset: void;
};

const bus = createBus<Events>();

bus.on("moved", ({ x, y }) => console.log(x + y));
bus.emit("moved", { x: 1, y: 2 });
bus.emit("reset");
bus.emit("moved", { x: "1" }); // error: x is a number
bus.emit("jumped", 1); // error: there is no such event
```

The map is optional: a bus without it takes any string and gives the payload as `unknown`.

## 3. The context of a handler

The second argument is the context of this call. A handler can emit events through it.

```ts
bus.on("moved", ({ x, y }, ctx) => {
  if (x < 0) ctx.emit("outOfBounds", { x, y });
});
```

Each call of a handler is a **task**, and `ctx` is what the task knows about itself: its `signal`, a way to `abort` it, and `emit`, `on`, `run`. A task that is aborted stops emitting.

## 4. Three ways to name an event

`emit` and `on` take the event as a string, as an object `{ type, payload }`, or as a function that has a `type` property.

```ts
bus.emit("moved", { x: 1, y: 2 }); // a string, and the payload next to it

bus.emit({ type: "moved", payload: { x: 2, y: 2 } }); // an object, the shape of a Redux action

const moved = createAction("moved");
bus.emit(moved({ x: 3, y: 2 })); // what an action creator makes is such an object
bus.on(moved, ({ x }) => console.log(x)); // and it names the event in `on` too
```

The third way is a function. A function with a `type` is a **command**: `emit` tells the subscribers of its type, then runs it, and **returns what it returns**.

```ts
import { createAction, createCommand } from "nanoeffects/actions";

const double = createCommand("math/double", (value: number) => value * 2);

bus.emit(double, 21); // 42
```

Strings are for the plain case, objects for actions that other code already makes, functions for requests that need a result.

## 5. A command needs a handler

A command made with a function carries its handler, as above. More often it is only a contract, a name with the types of the request and the result, and the code that does the work is registered separately: in another file, or a fake one in a test.

```ts
import { createCommand, commandsPlugin } from "nanoeffects/actions";

const getUser = createCommand<string, Promise<User>>("user/get"); // no handler yet

const bus = createBus<Events>();
const commands = bus.use(commandsPlugin()); // the handlers of this bus

bus.emit(getUser, "1"); // throws: No handler for command "user/get"

const unregister = commands.handle(getUser, (id) => api.user(id));
const user = await bus.emit(getUser, "1"); // what the handler returned

unregister(); // the command has no handler again
```

- `handle` returns the function that removes the handler, like `on`.
- If a command has several handlers, the one registered last runs. A handler registered here wins over the one the command was made with.
- Each bus has its own registry, so every test can bring its own handlers.
- A [module](#10-modules) registers handlers for itself and removes them when it is unmounted.

## 6. The first policy

Often a handler is called again before the last call has finished: a user types another letter, a button is clicked twice. A **policy** wraps the handler and decides what happens then. It is used in place of the handler:

```ts
import { latest } from "nanoeffects/policies";

// a newer search aborts the older one
bus.on(
  "search",
  latest(async (query, { signal }) => {
    await api.search(query, { signal });
  }),
);
```

The aborted call learns about it through `signal`: pass it to `fetch` and the request is cancelled. Nothing else changes: the handler is the same function with the same arguments.

## 7. More policies

| Policy     | When calls overlap                          |
| ---------- | ------------------------------------------- |
| `latest`   | the previous call is aborted                |
| `leading`  | new calls are dropped while one runs        |
| `debounce` | runs after a pause in the calls             |
| `throttle` | runs at most once in a time window          |
| `queue`    | one after another, in order                 |

Even a plain function works, it is just called less often. And policies nest:

```ts
import { debounce, queue, throttle } from "nanoeffects/policies";

bus.on("scroll", throttle(100, (position) => updateScrollbar(position)));
bus.on("typed", debounce(300, (text) => validate(text)));
bus.on("save", queue(async (draft, { signal }) => api.save(draft, { signal })));

// wait for quiet, then keep only the latest
bus.on("search", debounce(300, latest(async (query, { signal }) => api.search(query, { signal }))));
```

More in [policies](policies.md).

## 8. The first effects

An **effect** adds what an async handler usually needs. `retry` and `timeout` wrap a handler the way a policy does, so they go into `on` with the policies and need no `ctx`:

```ts
import { retry, timeout } from "nanoeffects/effects";

const search = (query: string, { signal }) => api.search(query, { signal });

// 5 seconds for each try, up to 3 tries, and a newer query supersedes the whole thing
bus.on("typed", latest(retry(timeout(5000, search), { times: 3 })));
```

When the handler needs the result, `ctx.run` runs the wrapped function as a child task: it is aborted with the handler, and it is the one place where `ctx` is written.

```ts
bus.on(
  "search",
  latest(async (query, ctx) => {
    const items = await ctx.run(retry(timeout(5000, search), { times: 3 }), query);
    ctx.emit("results", items);
  }),
);
```

For one call in the middle of a handler, the effect takes `ctx` first: `await retry(ctx, () => api.search(q, { signal: ctx.signal }))`. More in [effects](effects.md).

## 9. Several things at once, and waiting

```ts
import { all, take } from "nanoeffects/effects";

bus.on("search", async (id, ctx) => {
  const { user, posts } = await all(ctx, {
    user: ({ signal }) => api.user(id, { signal }),
    posts: ({ signal }) => api.posts(id, { signal }),
  });
});

bus.on("typed", async (query, ctx) => {
  const position = await take(ctx, "scroll"); // resolves with the next scroll
});
```

`all` runs the starters together and fails, and cancels the rest, when one fails. `take` waits for the next event of a name. `ctx.on` subscribes as the task and ends with it. More in [effects](effects.md).

## 10. Modules

A module is what one part of the app does, in one place: its handlers, its commands, its background tasks. Unmounting it undoes all of that.

```ts
import { createModule, modulePlugin } from "nanoeffects/actions";

const greeting = createModule<Events>("greeting", (m) => {
  m.on("greet", (name) => console.log(`hello ${name}`));
  m.handle(getUser, (id) => api.user(id)); // a contract gets its handler here
  m.use(double); // a command that carries a handler: the module brings it
});

const app = bus.use(modulePlugin([greeting]));
app.unmount(greeting); // the subscriptions and the handler are gone
```

Modules are also what makes [hot reload](hmr.md) work. More in [actions](actions.md).

## 11. Errors and typos

```ts
const bus = createBus<Events>({
  onError: (error) => report(error), // a failing handler does not stop the others
  onUnhandled: ({ type }) => console.warn(`nobody listens to ${type}`), // a typo in a name
});
```

More in [errors](errors.md).

## Where next

[Context fields](context.md) (a store or a client in every task) · [Tracing](tracing.md) · [Redux, Zustand, MobX](stores.md) · [Semantics](semantics.md)
