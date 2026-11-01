# Working with context

> **Level D.** Read first: [Guide](guide.md#1-create-a-bus).

Optional: put a store, client or logger on every task, or give fields to one action, module or call. Skip until many handlers need the same dependency.

## On this page

- [Context fields](#context-fields)
  - [Pass values at runtime](#pass-values-at-runtime)
  - [Type the fields (optional)](#type-the-fields-optional)
  - [Build a field from the signal of each task](#build-a-field-from-the-signal-of-each-task)
- [Scope: fields for an action, a module and a call](#scope-fields-for-an-action-a-module-and-a-call)
  - [Turn scopes on](#turn-scopes-on)
  - [Give an action its own fields](#give-an-action-its-own-fields)
  - [Bind an effect to the task](#bind-an-effect-to-the-task)
  - [Replace a field for one call](#replace-a-field-for-one-call)
  - [Give an action, a job or a module its own fields](#give-an-action-a-job-or-a-module-its-own-fields)
  - [Which value wins](#which-value-wins)
  - [Keep a generic effect generic](#keep-a-generic-effect-generic)
  - [Type the fields of a scope](#type-the-fields-of-a-scope)
  - [Limits](#limits)

## Context fields

### Pass values at runtime

<!-- docs-check: new -->

```js
import { createBus } from "nanoeffects";

// createBus({ context }) — every task gets these fields
const bus = createBus({ context: { store } });

bus.on("save", (draft, { store }) => {
  store.put(draft);
});
```

Here `store` is your own object: a store, an API client, a logger, anything. That is enough in JavaScript. The fields appear on handlers, `ctx.run`, `ctx.on`, actions, modules, and child tasks of effects and policies.

Library fields (`signal`, `emit`, `run`, …) win on name clashes. `context` may be a function `(task) => fields` when the value depends on the task.

To get `race`, `all`, `take` and the like on every task without passing `ctx`, see [`effectsPlugin`](effects.md#effectsplugin).

To give fields to **one** action, job or module, or to replace them for one `emit`, see [scopes](context.md#scope-fields-for-an-action-a-module-and-a-call).

### Type the fields (optional)

<!-- docs-check: new -->

In TypeScript, `contextPlugin` (from `nanoeffects/context`) puts the fields on every task of **this** bus and takes their types from the value you pass. The event map holds only events. It does not wire anything across the app — another bus can have different fields or none.

```ts
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";

// Events — event name → payload
type Events = { save: Draft };

// contextPlugin — every task gets ctx.store; the type is the type of `store`
const bus = createBus<Events>().use(contextPlugin({ store }));

bus.on("save", (draft, { store }) => store.put(draft));
```

- A function `(task) => fields` makes the fields per task. It gets `{ type, payload }`.
- Several `contextPlugin` calls, `effectsPlugin` and the `context` option of `createBus` all add their fields to the same context.
- A name that the bus already has is a type error. The fields of the library (`signal`, `emit`, `run`, …) win at runtime, and a field that the context already has is not replaced.
- The plugin returns the same bus, so keep the result of the chain: `const bus = createBus().use(contextPlugin({ store }))`.

### Build a field from the signal of each task

<!-- docs-check: new -->

Problem: an HTTP client or a database handle should stop when the task is aborted. Without help, every handler passes `ctx.signal` to it by hand, and one forgotten call leaves a request running.

`fromSignal(make)` from `nanoeffects/signal` marks a field of `contextPlugin` as a value that is built from the signal of the task. It does not run `make` for the bus: it runs it for each task that reads the field, once, with the `ctx.signal` of that task.

```js
import { createBus } from "nanoeffects";
import { contextPlugin } from "nanoeffects/context";
import { fromSignal } from "nanoeffects/signal";
import axios from "axios";

// contextPlugin — every task gets these fields
// fromSignal — http is made from the signal of the task that reads ctx.http
const bus = createBus().use(
  contextPlugin({
    logger: console, // a plain field: the same object for every task
    http: fromSignal((signal) => axios.create({ signal })),
  }),
);

bus.on("user/open", async (id, ctx) => {
  const response = await ctx.http.get(`/users/${id}`); // aborts with the task
  ctx.logger.log(response.data);
});
```

- `make` runs at the first read, so a handler that never uses `ctx.http` pays nothing for it.
- A task that `ctx.run` starts builds its own value from its own signal, so aborting the child stops only the child's requests.
- The field is not copied by `{ ...ctx }` and `Object.keys(ctx)` does not list it. Read `ctx.http` first if you copy a context.
- Without `contextPlugin` a `fromSignal` marker is only an object.

#### Name the fields in the event map instead

`createBus<Events>({ context: { store } })` also types the fields, but through the event map: `WithContext` is checker-only and says which fields the handlers of this bus have. Use it when you cannot call `use`, for example for the bus that `createEffectsMiddleware` makes.

```ts
import { createBus, type WithContext } from "nanoeffects";

// WithContext — checker-only: handlers also have ctx.store
type Events = { save: Draft } & WithContext<{ store: Store }>;

const bus = createBus<Events>({ context: { store } });
```

## Scope: fields for an action, a module and a call

Optional, for domain logic. Use it when one action needs its own client, one module its own logger, or one test its own fake, and a field on the whole bus ([context fields](context.md)) is too wide.

A **scope** is a plain object. Every key goes on `ctx` as it is (`cache`, `api`, `logger`), except one: `$effects`. Its functions take `{ signal }` as the first parameter, like `retry(ctx, fn)`, and go on `ctx` bound to the task, so you call `ctx.fetchJson(url)` instead of `fetchJson(ctx, url)`.

You give a scope to the thing that uses it. A call can replace it. Nothing else changes: handlers still get `(payload, ctx)`.

### Turn scopes on

<!-- docs-check: new -->

Scopes are a plugin, so a bus that does not use them pays nothing.

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — makes the scopes below work on this bus; returns the same bus
export const bus = createBus().use(scopePlugin());
```

The bus is in one file and the actions in files named after their domain, so the next example imports `bus` from here. Each section after it keeps its own `bus.js` and domain file, as if it were an app of its own.

- Without `scopePlugin` a scope is **ignored**: no error and no warning. If a field is missing from `ctx`, check this first.
- Use it in any order with the other plugins: a scope wins over `effectsPlugin`, `contextPlugin` and `createBus({ context })`.

### Give an action its own fields

<!-- docs-check: new -->

<!-- docs-check: continue -->

```js
// user.js
import { createAction } from "nanoeffects/actions";

// createAction — third argument is the scope of this action
export const getUser = createAction(
  "user/get",
  (id, { api, cache }) => {
    // api and cache are on ctx for this action only
    return cache.get(id) ?? api.getUser(id);
  },
  { api, cache: new Map() },
);
```

```js
import { bus } from "./bus";
import { getUser } from "./user";

const user = await bus.emit(getUser("1")); // the handler has api and cache
```

The listeners of `"user/get"` get the same fields when the action is emitted, because the fields belong to the call.

### Bind an effect to the task

<!-- docs-check: new -->

An effect is a function with `{ signal }` as its first parameter. In `$effects` it is bound to the task, so it stops with the task.

```js
// feed.js
import { createAction } from "nanoeffects/actions";
import { delay, race } from "nanoeffects/effects";

// your own effect: first parameter is the task (only its signal is used)
const fetchJson = (ctx, url) =>
  fetch(url, { signal: ctx.signal }).then((response) => response.json());

export const loadFeed = createAction(
  "feed/load",
  (url, { fetchJson, race, delay }) =>
    // race, delay, fetchJson — bound to this task: no ctx argument
    race({
      feed: () => fetchJson(url),
      timeout: () => delay(5000),
    }),
  // $effects — built-in and your own functions share one object
  { $effects: { fetchJson, race, delay } },
);
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

export const bus = createBus().use(scopePlugin());
```

```js
import { bus } from "./bus";
import { loadFeed } from "./feed";

const result = await bus.emit(loadFeed("/feed"));
```

- Put in `$effects` only functions that take `ctx` first. A plain function (a formatter, a logger) belongs in `context`.
- A function under any other key is copied as it is; a function in `$effects` is bound.
- `$effects` is the one name with a meaning. A field called `effects` is an ordinary field: `{ effects: { retries: 3 } }` puts that object on `ctx`, and nothing in it is bound.

### Replace a field for one call

<!-- docs-check: new -->

The second argument of `emit` is a scope for the tasks of **that** call. It is the usual way to give a test a fake.

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

export const bus = createBus().use(scopePlugin());
```

```js
// user.js
import { createAction } from "nanoeffects/actions";

export const getUser = createAction(
  "user/get",
  (id, { api }) => api.getUser(id),
  { api },
);
```

```js
import { bus } from "./bus";
import { getUser } from "./user";

// the real api for this call
await bus.emit(getUser("1"));

// the second argument — a fake api, for this call only
const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
await bus.emit(getUser("1"), { api: fakeApi });
```

Rules for the second argument:

- It works with the call of an action (`emit(getUser("1"), scope)`, `ctx.emit(loaded(user), scope)`).
- It does not work with the string form: in `emit("user/get", payload)` the second argument is the payload.
- It can replace `$effects` too: `{ $effects: { delay: instantDelay } }`.
- Fields of the library (`signal`, `emit`, …) in it are ignored.

### Give an action, a job or a module its own fields

<!-- docs-check: new -->

```js
// user.js
import { createAction, createJob } from "nanoeffects/actions";

// createAction — the listeners of this action's calls get the fields
export const userLoaded = createAction("user/loaded", { store });

// createJob — the scope is the fourth argument, after the outcomes;
// the handler and the listeners of the outcome get its fields
export const loadUser = createJob(
  "user/load",
  fetchUser,
  { success: userLoaded, fail: "user/failed" },
  { logger },
);
```

```js
// audit-module.js
import { createModule } from "nanoeffects/actions";
import { userLoaded } from "./user";

// createModule — third argument; everything the module owns gets the fields:
// m.on listeners, m.handle handlers, m.spawn tasks
export const auditModule = createModule(
  "audit",
  (m) => {
    m.on(userLoaded, (user, { logger }) => logger.info(user.id));
  },
  { logger },
);
```

If the outcome action (`success` or `fail`) has a scope of its own, its listeners see the job's fields with the action's own fields over them; the handler of the job sees only the job's.

A module scope does not leak: a listener registered outside the module does not see it.

### Which value wins

<!-- docs-check: new -->

When several places set the same field, the strongest one wins:

| Strength | Where it is set |
| -------- | --------------- |
| 1 (strongest) | the second argument of `emit` |
| 2 | the scope of the action or job |
| 3 | the scope of the module that owns the handler |
| 4 (weakest) | the bus: `createBus({ context })`, `contextPlugin`, `effectsPlugin` |

The fields of the library (`signal`, `abort`, `emit`, `on`, `off`, `run`, `type`, `payload`) are never replaced. The name `traceGroupId` is reserved: the tracer reads it, and it is not put on `ctx` ([Follow one flow](tracing.md#follow-one-flow-with-a-tracegroupid)). A child task (`ctx.run`, an attempt of `retry`) has the fields of its parent.

### Keep a generic effect generic

<!-- docs-check: new -->

In `$effects` a function loses its first parameter, and TypeScript cannot keep a generic through that step: `<T>(items: T[]) => T` becomes `(items: unknown[]) => unknown`. JavaScript code is not affected. If you want the exact type, use one of two ways.

`effect(fn)`: mark the function where you declare it, then put it in the scope like any other value. No annotation, so a JavaScript editor shows the exact hint too.

```js
// pick.js
import { createAction } from "nanoeffects/actions";
import { effect } from "nanoeffects/scope";

// effect — marks the function, so a scope binds it to the task; the editor keeps its generic
const first = effect((ctx, items) => items[0]);

export const pick = createAction("pick", (items, { first }) => first(items), {
  first, // a plain key of the scope, not an entry of `$effects`
});
```

Call `effect` where you declare the function, as above, and not inline in the scope: TypeScript does not infer the scope from a generic call written there.

`Effect<F>` (TypeScript): declare how the effect looks **after** it is bound, and keep it in `$effects`.

```ts
import { createAction } from "nanoeffects/actions";
import type { Effect } from "nanoeffects/effects";

// First — checker-only: how a handler calls the effect (no ctx)
type First = <T>(items: T[]) => T;

// Effect<First> — the function takes the task first and is typed as First once bound
const first: Effect<First> = (ctx, items) => items[0];

const pick = createAction(
  "pick",
  (id: string, { first }) => first([id]), // string
  { $effects: { first } },
);
```

`Effect<F>` and `effect` change what the checker sees. At run time the function is the same.

### Type the fields of a scope

<!-- docs-check: new -->

A handler of an action, job or module with a scope sees the fields of the scope in `ctx`, typed from the values you gave. You write no `WithContext`.

```ts
import { createAction } from "nanoeffects/actions";

type User = { id: string; name: string };

const getUser = createAction(
  "user/get",
  async (id: string, ctx) => {
    ctx.cache; // Map<string, User>, from the scope below
    return ctx.cache.get(id);
  },
  { cache: new Map<string, User>() },
);
```

- A field of a scope replaces a field of the same name from the bus in the type too.
- An override in `emit` must match the type of the field it replaces: `emit(getUser("1"), { cache: 1 })` is an error.
- A field that no scope and no bus declares has no type to check against, so `emit(call, { unknown: 1 })` is an error in TypeScript.
- `bus.on(creator, fn)` for an action with a scope types `ctx` with its fields.

### Limits

<!-- docs-check: new -->

- No plugin, no scope: see [Turn scopes on](#turn-scopes-on).
- The fields of the bus are not in the handler of an action made with `createAction(…, scope)` unless you type `ctx` yourself; the fields of the scope are.
- The string form of `emit` takes no scope.
- `effect(fn)` works only as a value of a scope, not as an entry of `$effects`.
- A scope on an action, job or module is typed without the events of a bus, so `take` in its `$effects` takes any event name.
