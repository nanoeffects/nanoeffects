# Actions, commands, jobs and modules

Use this page when **domain logic lives on the bus**, off the UI: the UI emits and listens; handlers and modules own the work.

If you only need `on` / `emit` or policies, stay in the [Guide](guide.md) until you need a result from `emit` or a mountable domain.

Recipe without a UI framework: [`examples/modules.ts`](../examples/modules.ts).

## Return a value from `emit` with a command

```js
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";

const bus = createBus();

// createCommand — emit runs the handler and returns its result
const double = createCommand("math/double", (value) => value * 2);
bus.emit(double(21)); // 42
```

## Describe events, commands, and jobs

`nanoeffects/actions` has the pieces to name what a bus does, apart from the code that does it.

```js
import { createAction, createCommand, createJob } from "nanoeffects/actions";

// createAction — event with a payload (like RTK createAction)
const userLoaded = createAction("user/loaded");
const loadFailed = createAction("user/failed");

// createCommand with a handler — emit returns what the handler returns
const getUser = createCommand("user/get", (id, { signal }) => {
  return fetchUser(id, { signal });
});

// createCommand without a handler — a contract; register the work elsewhere
const sendMail = createCommand("mail/send");

// createJob — command that also emits success / fail actions
const loadUser = createJob("user/load", fetchUser, {
  success: userLoaded,
  fail: "user/failed",
});
```

### Actions

`createAction(type)` returns a creator. Without generics it keeps the literal type; the bus checks the payload against its event map. Without an event map, give the payload type: `createAction<User>("user/loaded")`.

- `userLoaded(user)` → `{ type, payload }`
- `userLoaded.type` — the type string
- `userLoaded.match(action)` — narrows an action
- `createAction(type, prepare)` — build the payload from several arguments
- Works as the event of its type: `bus.emit(userLoaded(user))`, `bus.on(userLoaded, fn)`

### Commands

Calling a command builds `{ type, payload }` like `createAction`. `bus.emit(command(payload))` (or `bus.emit(command, payload)`) tells the listeners of the command’s type, then runs its handler as a task and returns the result.

- Wrap the handler in a policy: `createCommand("search", latest(fn))`.
- `command.match(action)` narrows like an action creator’s `match`.

**Where handlers are registered.** The command may carry a handler. The bus can also take handlers from a registry (`commandsPlugin`). A handler bound there wins over the command’s own. Each bus (each test) has its own registry.

```js
import { createBus } from "nanoeffects";
import {
  bindHandler,
  commandsPlugin,
  createCommand,
} from "nanoeffects/actions";

const sendMail = createCommand("mail/send");
const getUser = createCommand("user/get");

const bus = createBus();

// commandsPlugin — registry of handlers for this bus
const commands = bus.use(
  commandsPlugin([bindHandler(sendMail, smtpSend)]),
);

// later, e.g. in a test — latest binding wins
const unbind = commands.handle(getUser, async () => fakeUser);
unbind();
```

A command with no handler anywhere throws `No handler for command "..."` from `emit` (the call itself only builds the action).

The registry lives in `nanoeffects/actions`, so a bus without one carries none of that code. Without a registry, `emit` runs the command’s own handler. `bus.use(commandsPlugin())` sets `bus.commands`. A second plugin on the same bus replaces it. There is no `commands` option in `createBus`; assign a custom runner with `bus.commands = { run }`.

### Jobs

`createJob(type, handler, { success, fail })` makes a command that also sends its outcome as actions, when nobody waits for the result. It returns the command with `loadUser.success` and `loadUser.fail` on it.

- On success, emits `loadUser.success(result)`.
- On failure, emits `loadUser.fail(error)`.
- `success` / `fail` are a string (job makes an action creator) or an existing action creator. Missing ones become `<type>/success` or `<type>/fail`.
- `bus.emit(loadUser(id))` returns a promise of the result. Handler errors are always handled: they go to `fail` and the promise resolves with `undefined`. For a result that must reject, use a command.
- Outcome actions are emitted as the task that ran the job (also for a handler bound with `commands.handle`). Nothing is sent after abort.
- A missing handler is not an outcome: `emit` throws `No handler for command "..."`.
- Calling the job only builds `{ type, payload }`; the handler runs on `emit`.

## Mount domains with modules

**Problem.** A domain needs several subscriptions and command bindings. With plain `bus.on` / `commands.handle` you must remember every unsubscribe.

**When.** You want one mount / one unmount for that domain. Skip modules while a few top-level `bus.on` calls are enough.

`bus.use(modulePlugin(modules))` assembles an app from modules and returns `mount`, `unmount`, `isMounted`, `dispose`, `commands`, and `createModule`: the same as `createModule` below, with the context fields of the bus typed (see [TypeScript](typescript.md)).

```js
import { createBus } from "nanoeffects";
import {
  createCommand,
  createModule,
  modulePlugin,
} from "nanoeffects/actions";

const getUser = createCommand("user/get");
const saveUser = createCommand("user/save", persistUser);

// createModule — one domain; unmount undoes everything below
const userModule = createModule("user", (m) => {
  m.handle(getUser, fetchUser);
  m.use(saveUser, authModule);
  m.on("login", (user, ctx) => {
    ctx.emit("loaded", user);
  });
  m.spawn(async (_, ctx) => {
    /* background work; ends when the module unmounts */
  });
});

const bus = createBus();
// modulePlugin — mount modules on the bus
const app = bus.use(modulePlugin([userModule]));

const unmount = app.mount(orderModule); // later, e.g. after a lazy import
app.commands.handle(getUser, fakeUser); // in a test
app.dispose(); // unmounts every module
```

- **Unmounting undoes everything** the module did: subscriptions, bound commands, sub-modules, and background tasks (aborted).
- **A module is known by its name.** Mounting a module whose name is taken replaces the mounted one (see [Hot reload](hmr.md)).
- **Registry.** If `bus.use(commandsPlugin())` ran first, that registry is used; otherwise the module plugin attaches its own. Either way it is `bus.commands` and `app.commands`.
- A disposed app cannot mount modules.
- Module context = task context plus `handle`, `use`, and `spawn`:
  - `handle` — give a command a handler (contract, or override).
  - `use` — bring sub-modules and commands that carry a handler; the returned function undoes that call.
  - `spawn` — background task, aborted on unmount.
- A command that carries a handler keeps answering after unmount (`use` only tracks registration). Use `handle` for a handler that must live only as long as the module.

## Give a command, an action or a module its own fields

A command can need its own client, a module its own logger. Pass a scope, a plain object whose keys go on `ctx` (`$effects` binds functions to the task), as the last argument of `createCommand`, `createAction`, `createModule` and `createJob`, and turn it on with `scopePlugin`:

```js
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — makes the scope of a command work on this bus
const bus = createBus().use(scopePlugin());

// the third argument — fields of this command only
const getUser = createCommand("user/get", (id, { api }) => api.getUser(id), {
  api,
});

// a test replaces them for one call
const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
bus.emit(getUser("1"), { api: fakeApi });
```

The handler gets the fields typed. Without `scopePlugin` the scope is ignored. The full picture, with jobs, actions, modules and which value wins, is in [scopes](scope.md).
