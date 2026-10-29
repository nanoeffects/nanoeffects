# Use nanoeffects in a TypeScript app with many files

Read this page if your app is in TypeScript and the commands and modules live in different files. It shows how to write a command so that TypeScript infers its payload and result, and what to add when the handlers need the fields of your bus (`ctx.store`, the effects of `effectsPlugin`). For one file or for JavaScript you do not need it.

## Write a command with its handler

Give `createCommand` the handler and write nothing else. The payload comes from the annotated parameter, the result from the body. You do not write a generic.

<!-- docs-check: skip - a file of examples/typescript, type-checked there -->
```ts
// user.ts
import { createCommand, createModule } from "nanoeffects/actions";

export type User = { id: string; name: string };

// payload: string, from `id: string`; result: Promise<User>, from the body
export const getUser = createCommand(
  "user/get",
  async (id: string, { signal }) => {
    const response = await fetch(`/api/users/${id}`, { signal });
    const user: User = await response.json();
    return user;
  },
);

// createModule: m.use binds the handler the command carries, while the module is mounted
export const userModule = createModule("user", (m) => {
  m.use(getUser);
});
```

Mount the module where you create the bus. The result is typed from the handler:

<!-- docs-check: skip - a file of examples/typescript, type-checked there -->
```ts
// main.ts
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { getUser, userModule } from "./user";

const bus = createBus();
const app = bus.use(modulePlugin([userModule])); // mounts the modules

const user = bus.emit(getUser("1")); // Promise<User>
```

What you annotate, and why:

| Part | Annotated? | Why |
| ---- | ---------- | --- |
| payload (`id: string`) | yes | a function parameter has no type to infer from |
| `ctx` | no, for `signal` and the fields every task has | `signal`, `emit`, `on` and `run` are on every `ctx` |
| result | no | inferred from the body |

A wrong payload at the call (`getUser(1)`) is an error. Annotate the parameters, not the variable: a type on the whole variable, such as `const handler: Task<string, Events> = …`, fixes the type of the function, and the result becomes `unknown`.

## Give `ctx` the fields of your bus

Types of a bus live on the bus. `contextPlugin({ store })` and `effectsPlugin({ race })` make `ctx.store` and `ctx.race` known to the handlers of **that bus**. A command made in another file does not see the bus, so its `ctx` has no `store`:

<!-- docs-check: skip - shows the error on purpose -->
```ts
export const getUser = createCommand("user/get", (id: string, ctx) => {
  ctx.store; // error: Property 'store' does not exist
});
```

At runtime the bus still gives the task its fields. Only the checker does not know it. Name the types of the bus once, in the file that creates it. `contextPlugin` takes the type of each field from the value you pass, so the event map holds only events. `EventsOf` reads the event map from the bus, with the fields that the plugins added. The code of this section is in [`examples/typescript-context`](../examples/typescript-context).

<!-- docs-check: skip - a file of examples/typescript-context, type-checked there -->
```ts
// bus.ts
import { type Context, createBus, type EventsOf } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { contextPlugin } from "nanoeffects/context";
import { effectsPlugin, race } from "nanoeffects/effects";

// Events: event name → payload; nothing about ctx is written here
type Events = { "user/loaded": User };

export const bus = createBus<Events>()
  .use(contextPlugin({ store })) // ctx.store, typed from the value `store`
  .use(effectsPlugin({ race })); // ctx.race; each plugin returns the same bus, typed with its fields

// the app of the bus: mounts modules and creates them with the types of the bus
export const app = bus.use(modulePlugin()); // no modules yet: main.ts mounts them
export const { createModule } = app; // createModule with the types of the bus

export type AppEvents = EventsOf<typeof bus>; // the event map and all fields of ctx
export type AppContext = Context<AppEvents>; // ctx of a handler of this bus: has store and race
```

| Type | What it is | Why you name it |
| ---- | ---------- | --------------- |
| `EventsOf<typeof bus>` | the event map of the bus, with the context fields of the plugins (and of `WithContext`, if you use it) | the source of `AppContext` |
| `Context<AppEvents>` | the `ctx` that a handler of the bus gets | annotate the `ctx` of a handler given to `createCommand` |

These types change nothing at runtime. They only tell the checker what the bus already does.

Annotate `ctx` with `AppContext` where the handler reads a field of the bus, and create the module with the `createModule` that `bus.ts` exports, so its `m.on` handlers see the fields too:

<!-- docs-check: skip - a file of examples/typescript-context, type-checked there -->
```ts
// user.ts
import { createCommand } from "nanoeffects/actions";
import { type AppContext, createModule } from "./bus";

export const getUser = createCommand(
  "user/get",
  (id: string, { store, signal }: AppContext) => store.fetchUser(id, { signal }),
);

// createModule from bus.ts: handlers of the module see the context fields of the bus
export const userModule = createModule("user", (m) => {
  m.use(getUser);
  m.on("user/loaded", (user, { store }) => store.remember(user));
});
```

<!-- docs-check: skip - a file of examples/typescript-context, type-checked there -->
```ts
// main.ts: the modules are mounted here, because the module files need `app`
import { app, bus } from "./bus";
import { getUser, userModule } from "./user";

const unmount = app.mount(userModule); // starts the module; unmount() undoes it
const user = bus.emit(getUser("1")); // Promise<User>
```

`createModule` of the app only creates the module: it does not mount it, and it keeps no link to the bus. That is why the app in `bus.ts` starts without modules. `createModule` from `nanoeffects/actions` stays for a module made without a bus: there you write the event map yourself, `createModule<AppEvents>("user", …)`.

## Type a function that takes the signal

A function that makes a request should take the `signal` of the task, so aborting the task cancels the request. `WithSignal` is the type for that parameter: an object with a `signal`. It is checker-only, like `WithContext`: it adds nothing to your bundle.

```ts
import type { WithSignal } from "nanoeffects";

// WithSignal — { signal: AbortSignal }; a task context fits it, and so does { signal } on its own
const search = (query: string, { signal }: WithSignal) =>
  fetch(`/search?q=${encodeURIComponent(query)}`, { signal });
```

Pass `ctx` (or `{ signal }`) when you call it. The effects of `nanoeffects/effects` (`retry`, `timeout`, `all`) take an optional signal instead, because outside a task you may pass `{}`; that is a different type, and you do not write it.

## Keep the contract apart from the code

When the file with the command must not import the code that implements it, make the command without a handler. Here you write the payload and the result once, as generics, and the handler goes to a module, where it needs no annotation:

<!-- docs-check: skip - fragment of the file above -->
```ts
export const getUser = createCommand<string, Promise<User>>("user/get"); // the contract

createModule("user", (m) => {
  // payload and result come from the command, ctx from the app: no annotation
  m.handle(getUser, (id, { store, signal }) => store.fetchUser(id, { signal }));
});
```

A wrong payload, a wrong field of `ctx` and a wrong result are errors.

## Check your setup

- **A field is missing on `ctx`.** The `ctx` of a handler given to `createCommand` is not annotated: add `: AppContext`. A handler written inline in `m.handle` or `m.on` of a module made with the `createModule` of `bus.ts` does not need it. The default `ctx` has no fields of your bus.
- **`EventsOf<typeof bus>` is `never`.** `bus` is not a bus. `bus.use(commandsPlugin())` and `bus.use(modulePlugin(...))` return the registry or the app, not the bus: keep the bus in its own constant (`bus`, then `app = bus.use(modulePlugin())`).
- **`effectsPlugin` is not in the type.** `use` must come before you read `typeof bus`. Chain `createBus(...).use(effectsPlugin(...))` in one binding.
- **A policy loses the types.** It does not: `latest(handler)` keeps the payload, the result and the context of `handler`.
- **Do not pass the context as a generic of `createCommand`.** It is the fourth generic, after the payload, the result and the type string, so you would have to write all four. Annotate `ctx` with `AppContext`, or put the handler in a module made with the `createModule` of `bus.ts`.
