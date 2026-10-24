# Pin context fields to a command, an action, a module or a call

Optional, for domain logic. Use it when one command needs its own client, one module its own logger, or one test its own fake, and a field on the whole bus ([context fields](context.md)) is too wide.

A **scope** is a plain object. Every key goes on `ctx` as it is (`cache`, `api`, `logger`), except one: `effects`. Its functions take `{ signal }` as the first parameter, like `retry(ctx, fn)`, and go on `ctx` bound to the task, so you call `ctx.fetchJson(url)` instead of `fetchJson(ctx, url)`.

You give a scope to the thing that uses it. A call can replace it. Nothing else changes: handlers still get `(payload, ctx)`.

## Turn scopes on

Scopes are a plugin, so a bus that does not use them pays nothing.

```js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — makes the scopes below work on this bus; returns the same bus
const bus = createBus().use(scopePlugin());
```

- Without `scopePlugin` a scope is **ignored**: no error and no warning. If a field is missing from `ctx`, check this first.
- Use it **after** `effectsPlugin` (an effect it adds later would be assigned over an effect of a scope with the same name) and **before** `modulePlugin` (it mounts the modules when it is used). `contextPlugin` and `createBus({ context })` can come in any order: a scope wins over them.

## Give a command its own fields

```js
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { scopePlugin } from "nanoeffects/scope";

const bus = createBus().use(scopePlugin());

// createCommand — third argument is the scope of this command
const getUser = createCommand(
  "user/get",
  (id, { api, cache }) => {
    // api and cache are on ctx for this command only
    return cache.get(id) ?? api.getUser(id);
  },
  { api, cache: new Map() },
);

const user = await bus.emit(getUser("1")); // the handler has api and cache
```

The listeners of `"user/get"` get the same fields when the command is emitted, because the fields belong to the call.

## Bind an effect to the task

An effect is a function with `{ signal }` as its first parameter. In `effects` it is bound to the task, so it stops with the task.

```js
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { delay, race } from "nanoeffects/effects";
import { scopePlugin } from "nanoeffects/scope";

const bus = createBus().use(scopePlugin());

// your own effect: first parameter is the task (only its signal is used)
const fetchJson = (ctx, url) =>
  fetch(url, { signal: ctx.signal }).then((response) => response.json());

const loadFeed = createCommand(
  "feed/load",
  (url, { fetchJson, race, delay }) =>
    // race, delay, fetchJson — bound to this task: no ctx argument
    race({
      feed: () => fetchJson(url),
      timeout: () => delay(5000),
    }),
  // effects — built-in and your own functions share one object
  { effects: { fetchJson, race, delay } },
);

const result = await bus.emit(loadFeed("/feed"));
```

- Put in `effects` only functions that take `ctx` first. A plain function (a formatter, a logger) belongs in `context`.
- A function under any other key is copied as it is; a function in `effects` is bound.
- `effects` is the one name a field of the scope cannot have.

## Replace a field for one call

The second argument of `emit` is a scope for the tasks of **that** call. It is the usual way to give a test a fake.

```js
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { scopePlugin } from "nanoeffects/scope";

const bus = createBus().use(scopePlugin());
const getUser = createCommand("user/get", (id, { api }) => api.getUser(id), {
  api,
});

// the real api for this call
await bus.emit(getUser("1"));

// the second argument — a fake api, for this call only
const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
await bus.emit(getUser("1"), { api: fakeApi });
```

Rules for the second argument:

- It works with an action or a command call (`emit(getUser("1"), scope)`, `ctx.emit(loaded(user), scope)`).
- It does not work with the string form: in `emit("user/get", payload)` the second argument is the payload.
- It can replace `effects` too: `{ effects: { delay: instantDelay } }`.
- Fields of the library (`signal`, `emit`, …) in it are ignored.

## Give an action, a job or a module its own fields

```js
import { createAction, createJob, createModule } from "nanoeffects/actions";

// createAction — the listeners of this action's calls get the fields
const userLoaded = createAction("user/loaded", { store });

// createJob — the scope is the fourth argument, after the outcomes;
// the handler and the listeners of the outcome get its fields
const loadUser = createJob(
  "user/load",
  fetchUser,
  { success: userLoaded, fail: "user/failed" },
  { logger },
);

// createModule — third argument; everything the module owns gets the fields:
// m.on listeners, m.handle handlers, m.spawn tasks
const auditModule = createModule(
  "audit",
  (m) => {
    m.on(userLoaded, (user, { logger }) => logger.info(user.id));
  },
  { logger },
);
```

If the outcome action (`success` or `fail`) has a scope of its own, its listeners see the job's fields with the action's own fields over them; the handler of the job sees only the job's.

A module scope does not leak: a listener registered outside the module does not see it.

## Which value wins

When several places set the same field, the strongest one wins:

| Strength | Where it is set |
| -------- | --------------- |
| 1 (strongest) | the second argument of `emit` |
| 2 | the scope of the action, command or job |
| 3 | the scope of the module that owns the handler |
| 4 (weakest) | the bus: `createBus({ context })`, `contextPlugin`, `effectsPlugin` |

The fields of the library (`signal`, `abort`, `emit`, `on`, `off`, `run`, `type`, `payload`) are never replaced. A child task (`ctx.run`, an attempt of `retry`) has the fields of its parent.

## Keep a generic effect generic

In `effects` a function loses its first parameter, and TypeScript cannot keep a generic through that step: `<T>(items: T[]) => T` becomes `(items: unknown[]) => unknown`. JavaScript code is not affected. If you want the exact type, use one of two ways.

`effect(fn)`: mark the function where you declare it, then put it in the scope like any other value. No annotation, so a JavaScript editor shows the exact hint too.

```js
import { createCommand } from "nanoeffects/actions";
import { effect } from "nanoeffects/scope";

// effect — marks the function, so a scope binds it to the task; the editor keeps its generic
const first = effect((ctx, items) => items[0]);

const pick = createCommand("pick", (items, { first }) => first(items), {
  first, // a plain key of the scope, not an entry of effects
});
```

Call `effect` where you declare the function, as above, and not inline in the scope: TypeScript does not infer the scope from a generic call written there.

`Effect<F>` (TypeScript): declare how the effect looks **after** it is bound, and keep it in `effects`.

```ts
import { createCommand } from "nanoeffects/actions";
import type { Effect } from "nanoeffects/effects";

// First — checker-only: how a handler calls the effect (no ctx)
type First = <T>(items: T[]) => T;

// Effect<First> — the function takes the task first and is typed as First once bound
const first: Effect<First> = (ctx, items) => items[0];

const pick = createCommand(
  "pick",
  (id: string, { first }) => first([id]), // string
  { effects: { first } },
);
```

`Effect<F>` and `effect` change what the checker sees. At run time the function is the same.

## Type the fields (optional)

A handler of a command, job or module with a scope sees the fields of the scope in `ctx`, typed from the values you gave. You write no `WithContext`.

```ts
import { createCommand } from "nanoeffects/actions";

type User = { id: string; name: string };

const getUser = createCommand(
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

## Limits

- No plugin, no scope: see [Turn scopes on](#turn-scopes-on).
- The fields of the bus are not in the handler of a command made with `createCommand(…, scope)` unless you type `ctx` yourself; the fields of the scope are.
- The string form of `emit` takes no scope.
- `effect(fn)` works only as a value of a scope, not as an entry of `effects`.
- A scope on a command, action, job or module is typed without the events of a bus, so `take` in its `effects` takes any event name.
