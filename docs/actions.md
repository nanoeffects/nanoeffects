# Actions, commands, jobs and modules

## Actions, commands and jobs

`nanoeffects/actions` has the pieces to describe what a bus does, apart from the code that does it.

```ts
import { createAction, createCommand, createJob } from "nanoeffects/actions";

// an event with a payload, as in Redux Toolkit
// the payload types come from the event map of the bus: type Events = { "user/loaded": User; "user/failed": Error }
const userLoaded = createAction("user/loaded");
const loadFailed = createAction("user/failed");

// a request for a result: emit it and get what its handler returns
const getUser = createCommand("user/get", (id: string, { signal }) => fetchUser(id, { signal }));

// a contract without a handler: the code that sends mail is elsewhere
const sendMail = createCommand<Mail, void>("mail/send");

// a command whose outcome is sent on as actions: they are its properties, loadUser.success and loadUser.fail
const loadUser = createJob("user/load", fetchUser, {
  success: userLoaded, // an action creator that exists: used and returned as it is
  fail: "user/failed", // a string: the job makes the action creator
});
```

**Actions.** `createAction(type)` returns a creator, with no generics: it keeps the literal type, and the bus checks the payload against its event map (`bus.emit(userLoaded(5))` is an error when `"user/loaded"` is a `User`). Without an event map give the payload type, `createAction<User>("user/loaded")`. The creator: `userLoaded(user)` is `{ type, payload }`, `userLoaded.type` is the type, `userLoaded.match(action)` narrows an action. `createAction(type, prepare)` builds the payload from several arguments. A creator works as the event of its type: `bus.emit(userLoaded(user))`, `bus.on(userLoaded, fn)`.

**Commands.** Calling a command builds `{ type, payload }` like `createAction`. `bus.emit(command(payload))` (or `bus.emit(command, payload)`) tells the listeners of the command's type, then runs its handler as a task, with a context, and returns the result. The handler can be wrapped in a policy, `createCommand("search", latest(fn))`. `command.match(action)` tells whether an action has the command's type and narrows it, as `match` of an action creator does.

**Where handlers are registered.** The command may carry a handler. The bus gets the handlers bound to commands from a registry, `commandsPlugin`, and a handler bound there wins over the command's own. The registry belongs to one bus, as an effector scope does with `fork({ handlers })`, so each bus (each test) can have its own.

```ts
import { commandsPlugin, bindHandler } from "nanoeffects/actions";

const bus = createBus<Events>();
const commands = bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)])); // attached to the bus

const unbind = commands.handle(getUser, async () => fakeUser); // later, e.g. in a test
unbind(); // the command's own handler is back; the latest binding wins
```

A command with no handler anywhere throws `No handler for command "..."` from `emit` (the call itself only builds the action). The registry lives in `nanoeffects/actions`, so a bus without one carries none of this code; without it `emit` simply runs the command's own handler. `bus.use(commandsPlugin())` sets the registry as `bus.commands`, and a second one on the same bus replaces it. There is no `commands` option in `createBus`; a custom runner is assigned, `bus.commands = { run }`.

**Jobs.** `createJob(type, handler, { success, fail })` makes a command that sends its outcome on as actions, for when nobody waits for the result, and returns the command itself, with the two actions on it: `loadUser.success` and `loadUser.fail`. When the handler succeeds, `loadUser.success(result)` is emitted on the bus, and when it fails, `loadUser.fail(error)`.

- `success` and `fail` are a string, from which the job makes an action creator with `createAction` (the payload is the result, or the error), or an action creator that exists already, which is used and returned as it is. A missing one is made with the type `<type>/success` or `<type>/fail`.
- `bus.emit(loadUser(id))` returns a promise of the result. An error of the handler always counts as handled: it goes to `loadUser.fail` and the promise resolves with `undefined`. For a result that must reject, use a command.
- The actions are emitted as the task that ran the job, also for a handler bound with `commands.handle`, and are not sent once the task is aborted. A missing handler is not an outcome: `emit` throws `No handler for command "..."`.
- Calling the job builds `{ type, payload }` like a command; it does not run the handler until `emit`.

## Modules

`bus.use(modulePlugin(modules))`, with `modulePlugin` from `nanoeffects/actions`, assembles an app from modules and returns `mount`, `unmount`, `isMounted`, `dispose` and `commands`, the registry of command handlers. A module is what a domain of the app needs: the commands it handles, the events it listens to, its sub-modules and its background tasks.

```ts
const userModule = createModule<Events>("user", (m) => {
  m.handle(getUser, fetchUser); // a contract gets its handler here
  m.use(saveUser, authModule); // a command that carries a handler, and a sub-module
  m.on("login", (user, ctx) => ctx.emit("loaded", user));
  m.spawn(async (_, ctx) => { /* background work, ends with the module */ });
});

const bus = createBus<Events>();
const app = bus.use(modulePlugin([userModule]));

const unmount = app.mount(orderModule); // later, e.g. after a lazy import
app.commands.handle(getUser, fakeUser); // in a test
app.dispose(); // unmounts every module
```

- **Unmounting undoes everything** the module did: its subscriptions, its bound commands, its sub-modules and its background tasks, which are aborted.
- **A module is known by its name.** Mounting a module whose name is taken replaces the mounted one. That is what hot reload needs: see [hmr.md](hmr.md).
- **The registry.** If `bus.use(commandsPlugin())` was called, that registry is used; otherwise the module plugin attaches its own. Either way it is `bus.commands` and `app.commands`, so the commands that modules bind are the ones the bus runs.
- A disposed app cannot mount modules.
- A module context is a task context plus `handle` (give a command a handler: for a contract, or to override), `use` (bring sub-modules and commands that carry a handler: `m.use(getUser, saveUser, subModule)`, in any order; the returned function undoes just that call) and `spawn` (a background task, aborted on unmount).
- A command that carries a handler keeps answering after its module is unmounted: the handler is its own, and `use` only brings the command and tracks it in the registry. Use `handle` for a handler that should live only as long as the module.
