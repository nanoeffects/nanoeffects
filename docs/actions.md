# Actions, commands, jobs and modules

Use this page when **domain logic lives on the bus**, off the UI: the UI emits and listens; handlers and modules own the work.

If you only need `on` / `emit` or policies, stay in the [Guide](guide.md) until you need a result from `emit` or a mountable domain.

Recipe without a UI framework: [`examples/modules.ts`](../examples/modules.ts).

A chat with two entities and three features, jobs under policies and effects, and a stream tied to a module: [Build a chat with entities, features, modules and a small server](chat-example.md).

A whole project with two domains, a job and React as a thin layer: `npm create nanoeffects@latest my-app -- --template domains-ts` (see [Start a project from a template](starter.md#start-with-domains)).

## Return a value from `emit` with a command

The bus lives in one file and its events in another, so any module can import both without a cycle.

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — one bus for the app
export const bus = createBus();
```

```js
// math.js
import { createCommand } from "nanoeffects/actions";

// createCommand — emit runs the handler and returns its result
export const double = createCommand("math/double", (value) => value * 2);
```

```js
import { bus } from "./bus";
import { double } from "./math";

bus.emit(double(21)); // 42
```

## Describe events, commands, and jobs

`nanoeffects/actions` has the pieces to name what a bus does, apart from the code that does it.

```js
// user.js
import { createAction, createCommand, createJob } from "nanoeffects/actions";

// createAction — event with a payload (like RTK createAction)
export const userLoaded = createAction("user/loaded");
export const loadFailed = createAction("user/failed");

// createCommand with a handler — emit returns what the handler returns
export const getUser = createCommand("user/get", (id, { signal }) => {
  return fetchUser(id, { signal });
});

// createCommand without a handler — a contract; register the work elsewhere
export const sendMail = createCommand("mail/send");

// createJob — command that also emits success / fail actions
export const loadUser = createJob("user/load", fetchUser, {
  success: userLoaded,
  fail: "user/failed",
});
```

These are the events of the user domain, in a file of their own (`user.js`). The bus is made in another file (`bus.js` below), and neither imports the other.

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
// bus.js
import { createBus } from "nanoeffects";
import { bindHandler, commandsPlugin } from "nanoeffects/actions";
import { sendMail } from "./user";

export const bus = createBus();

// commandsPlugin — registry of handlers for this bus
export const commands = bus.use(
  commandsPlugin([bindHandler(sendMail, smtpSend)]),
);
```

```js
import { commands } from "./bus";
import { getUser } from "./user";

// later, e.g. in a test — latest binding wins
const unbind = commands.handle(getUser, async () => fakeUser);
unbind();
```

A command with no handler anywhere throws `No handler for command "..."` from `emit` (the call itself only builds the action).

The registry lives in `nanoeffects/actions`, so a bus without one carries none of that code. Without a registry, `emit` runs the command’s own handler. `bus.use(commandsPlugin())` sets `bus.commands`. A second `commandsPlugin` binds its list in that registry and returns it. There is no `commands` option in `createBus`; assign a custom runner with `bus.commands = { run }`.

### Jobs

`createJob(type, handler, { pending, success, fail, cancel })` makes a command that also sends its outcome as actions, when nobody waits for the result. It returns the command with `loadUser.pending`, `loadUser.success`, `loadUser.fail` and `loadUser.cancel` on it.

- When the handler starts, emits `loadUser.pending(payload)`.
- On success, emits `loadUser.success(result)`.
- On failure, emits `loadUser.fail(error)`.
- When the task is aborted before the handler settles, emits `loadUser.cancel(reason)` instead of `success` or `fail`. After `pending`, exactly one of the three follows.
- `pending` / `success` / `fail` / `cancel` are a string (job makes an action creator) or an existing action creator. Missing ones become `<type>/pending`, `<type>/success`, `<type>/fail` or `<type>/cancel`.
- `bus.emit(loadUser(id))` returns a promise of the result. Handler errors are always handled: they go to `fail` and the promise resolves with `undefined`. For a result that must reject, use a command.
- Outcome actions are emitted as the task that ran the job (also for a handler bound with `commands.handle`). `success` and `fail` are not sent after abort; `cancel` is, at the moment of the abort.
- A missing handler is not an outcome: `emit` throws `No handler for command "..."` and nothing is sent.
- Calling the job only builds `{ type, payload }`; the handler runs on `emit`.
- The outcomes are events like any other: with `onUnhandled` set on the bus, it is called for a `pending` or a `cancel` that nobody listens to.

## Show a loading state with a job

**Problem.** A spinner needs a flag that is `true` while a request runs. Setting it by hand in the handler (`loading = true`, then `try` / `finally`) breaks when the task is aborted: `ctx.emit` does nothing after an abort, so a flag that is cleared through the bus stays `true`.

**When.** The UI shows a loading state for a request, and the request can be aborted (a page is left, `ctx.abort()` is called). Skip it when nothing shows the state.

A job sends one action when the handler starts and one when it ends, whatever way it ends. A store sets the flag on `pending` and clears it on `success`, `fail` and `cancel`.

```js
// bus.js
import { createBus } from "nanoeffects";

// createBus — the bus the app shares
export const bus = createBus();
```

```js
// user.js
import { createJob } from "nanoeffects/actions";

// createJob — a command that also sends pending, success, fail and cancel
export const loadUser = createJob("user/load", fetchUser);
```

```js
// user-store.js
import { bus } from "./bus";
import { loadUser } from "./user";

export const state = { loading: false, user: null };

// pending — the handler starts: show the spinner
bus.on(loadUser.pending, () => {
  state.loading = true;
});

// success — the handler returned a user
bus.on(loadUser.success, (user) => {
  state.loading = false;
  state.user = user;
});

// fail — the handler threw
bus.on(loadUser.fail, () => {
  state.loading = false;
});

// cancel — the task was aborted: the only way to clear the flag then
bus.on(loadUser.cancel, () => {
  state.loading = false;
});
```

```js
// page.js
import { bus } from "./bus";
import { loadUser } from "./user";

// emit — runs the job; state.loading is true as soon as it returns
bus.emit(loadUser("1"));
```

`cancel` is sent at the moment of the abort, with the abort reason. A handler that ignores the signal and finishes later sends nothing more, so the flag is already `false`.

**With a policy.** A policy such as `latest`, `leading`, `debounce`, `throttle` or `queue` around the handler tells the job what it does with each call:

- `pending` is sent when the handler really starts: at once for `leading`, after the wait for `debounce`, when its turn comes for `queue`.
- A call that the policy drops before it starts sends nothing, not even `pending`. A second click that `leading` ignores does not clear the flag of the first.
- A run that `latest` replaces sends `cancel` before the next call sends `pending`.
- Every `pending` is followed by exactly one of `success`, `fail` and `cancel`, and nothing is sent without `pending`.

A flag is exact when calls do not overlap, or when `latest` replaces them. If several runs can go at once (`queue` with `concurrency` above 1, or a job without a policy called many times), keep a counter: add one on `pending` and take one off on `success`, `fail` and `cancel`. A policy that you write yourself, or that you hide in your own function, does not report to the job; `pending` is then sent at the call, as for a job with no policy.

## Mount domains with modules

**Problem.** A domain needs several subscriptions and command bindings. With plain `bus.on` / `commands.handle` you must remember every unsubscribe.

**When.** You want one mount / one unmount for that domain. Skip modules while a few top-level `bus.on` calls are enough.

`bus.use(modulePlugin(modules))` assembles an app from modules and returns `mount`, `unmount`, `isMounted`, `dispose`, `commands`, and `createModule`: the same as `createModule` below, with the context fields of the bus typed (see [TypeScript](typescript.md)).

```js
// user.js
import { createCommand } from "nanoeffects/actions";

export const getUser = createCommand("user/get");
export const saveUser = createCommand("user/save", persistUser);
```

```js
// user-module.js
import { createModule } from "nanoeffects/actions";
import { getUser, saveUser } from "./user";

// createModule — one domain; unmount undoes everything below
export const userModule = createModule("user", (m) => {
  m.handle(getUser, fetchUser);
  m.use(saveUser, authModule);
  m.on("login", (user, ctx) => {
    ctx.emit("loaded", user);
  });
  m.spawn(async (_, ctx) => {
    /* background work; ends when the module unmounts */
  });
});
```

```js
// bus.js
import { createBus } from "nanoeffects";
import { modulePlugin } from "nanoeffects/actions";
import { userModule } from "./user-module";

export const bus = createBus();
// modulePlugin — mount modules on the bus
export const app = bus.use(modulePlugin([userModule]));
```

```js
import { app } from "./bus";
import { getUser } from "./user";

const unmount = app.mount(orderModule); // later, e.g. after a lazy import
app.commands.handle(getUser, fakeUser); // in a test
app.dispose(); // unmounts every module
```

`mount` and `unmount` take any number of modules. Use it to start the domains of an app yourself, at the moment you choose and in the order you give, when you do not give them to `modulePlugin`:

```js
import { createModule } from "nanoeffects/actions";
import { app } from "./bus";

const userModule = createModule("user", (m) => {
  m.on("user/loaded", (user) => console.log(user));
});
const orderModule = createModule("order", (m) => {
  m.on("order/placed", (order) => console.log(order));
});

// mount — start both modules, left to right
const stop = app.mount(userModule, orderModule);

// the returned function stops them again, last mounted first (orderModule, then userModule)
stop();

// the same for modules that you already have in an array: spread it
const modules = [userModule, orderModule];
app.mount(...modules);
app.unmount(...modules); // also in reverse order
```

If the `setup` of one module throws, the modules of that call that were already mounted are unmounted again and the error is thrown, so a call mounts all of its modules or none. A module that is mounted already is skipped.

- **Unmounting undoes everything** the module did: subscriptions, bound commands, sub-modules, and background tasks (aborted).
- **A module is known by its name.** Mounting a module whose name is taken replaces the mounted one (see [Hot reload](hmr.md)).
- **Registry.** If `bus.use(commandsPlugin())` ran first, that registry is used; otherwise the module plugin attaches its own. Either way it is `bus.commands` and `app.commands`.
- A disposed app cannot mount modules.
- **The given modules are mounted at the end of the block that made the app**, or at the first use of the app or the bus if that comes first (the first `bus.emit`, or a call of `mount`, `unmount`, `isMounted`, `dispose`, or the read of `commands`). Nothing needs to use the app: `bus.use(modulePlugin([a, b]))` is enough to start them. The plugins that you use after `modulePlugin` in the same block still reach them, because the modules wait until that block has finished. A plugin used after an `await` can come too late: use every plugin before the first `await`. The `bus.on` calls made in between are held and made right after, so the listeners of a module stay ahead of them. See [using plugins in any order](plugins.md#use-them-in-any-order).
- **To mount by hand instead**, pass no modules: `modulePlugin()` starts nothing, and `app.mount(...)` starts the modules when you want.
- Module context = task context plus `handle`, `use`, and `spawn`:
  - `handle` — give a command a handler (contract, or override).
  - `use` — bring sub-modules and commands that carry a handler; the returned function undoes that call.
  - `spawn` — background task, aborted on unmount.
- A command that carries a handler keeps answering after unmount (`use` only tracks registration). Use `handle` for a handler that must live only as long as the module.

## Give a command, an action or a module its own fields

A command can need its own client, a module its own logger. Pass a scope, a plain object whose keys go on `ctx` (`$effects` binds functions to the task), as the last argument of `createCommand`, `createAction`, `createModule` and `createJob`, and turn it on with `scopePlugin`:

```js
// bus.js
import { createBus } from "nanoeffects";
import { scopePlugin } from "nanoeffects/scope";

// scopePlugin — makes the scope of a command work on this bus
export const bus = createBus().use(scopePlugin());
```

```js
// user.js
import { createCommand } from "nanoeffects/actions";

// the third argument — fields of this command only
export const getUser = createCommand(
  "user/get",
  (id, { api }) => api.getUser(id),
  { api },
);
```

```js
import { bus } from "./bus";
import { getUser } from "./user";

// a test replaces them for one call
const fakeApi = { getUser: async (id) => ({ id, name: "test" }) };
bus.emit(getUser("1"), { api: fakeApi });
```

The handler gets the fields typed. Without `scopePlugin` the scope is ignored. The full picture, with jobs, actions, modules and which value wins, is in [scopes](scope.md).
