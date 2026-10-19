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

// a command whose outcome is sent on as events
const loadUser = createJob("user/load", fetchUser, { done: userLoaded, fail: loadFailed });
```

**Actions.** `createAction(type)` returns a creator, with no generics: it keeps the literal type, and the bus checks the payload against its event map (`bus.emit(userLoaded(5))` is an error when `"user/loaded"` is a `User`). Without an event map give the payload type, `createAction<User>("user/loaded")`. The creator: `userLoaded(user)` is `{ type, payload }`, `userLoaded.type` is the type, `userLoaded.match(action)` narrows an action. `createAction(type, prepare)` builds the payload from several arguments. A creator works as the event of its type: `bus.emit(userLoaded(user))`, `bus.on(userLoaded, fn)`.

**Commands.** `bus.emit(command, payload)` tells the listeners of the command's type, then runs its handler as a task, with a context, and returns the result. The handler can be wrapped in a policy, `createCommand("search", latest(fn))`. Calling `command(payload)` runs its own handler without a bus.

**Where handlers are registered.** The command may carry a handler. The bus gets the handlers bound to commands from a registry, `createCommands`, and a handler bound there wins over the command's own. The registry belongs to one bus, as an effector scope does with `fork({ handlers })`, so each bus (each test) can have its own.

```ts
import { createCommands, bindHandler } from "nanoeffects/actions";

const bus = createBus<Events>();
const commands = createCommands(bus, [bindHandler(sendMail, smtpSend)]); // attached to the bus

const unbind = commands.handle(getUser, async () => fakeUser); // later, e.g. in a test
unbind(); // the command's own handler is back; the latest binding wins
```

A command with no handler anywhere throws `No handler for command "..."` from `emit`. The registry lives in `nanoeffects/actions`, so a bus without one carries none of this code; without it `emit(command, payload)` simply runs the command's own handler. `createCommands(bus)` sets the registry as `bus.commands`, and a second call on the same bus replaces it. There is no `commands` option in `createBus`; a custom runner is assigned, `bus.commands = { run }`.

**Jobs.** `createJob(type, handler, { done, fail })` is a command that sends its outcome on, for when nobody waits for the result. `done` receives the result and `fail` receives the error; each is anything `emit` takes: an event type, an action creator, a command, or a plain action. `bus.emit(job, payload)` still returns a promise of the result. With `fail` set the error counts as handled: it goes to `fail` and the promise resolves with `undefined`; without it the promise rejects. The outcome is routed also for a handler bound with `commands.handle`, and is not sent once the task is aborted.

## Modules

`registerModules(bus, modules)` from `nanoeffects/actions` assembles an app from modules and returns `mount`, `unmount`, `isMounted`, `dispose` and `commands`, the registry of command handlers. A module is what a domain of the app needs: the commands it handles, the events it listens to, its sub-modules and its background tasks.

```ts
const userModule = createModule<Events>("user", (m) => {
  m.handle(getUser, fetchUser); // a contract gets its handler here
  m.use(saveUser, authModule); // a command that carries a handler, and a sub-module
  m.on("login", (user, ctx) => ctx.emit("loaded", user));
  m.spawn(async (_, ctx) => { /* background work, ends with the module */ });
});

const bus = createBus<Events>();
const app = registerModules(bus, [userModule]);

const unmount = app.mount(orderModule); // later, e.g. after a lazy import
app.commands.handle(getUser, fakeUser); // in a test
app.dispose(); // unmounts every module
```

- **Unmounting undoes everything** the module did: its subscriptions, its bound commands, its sub-modules and its background tasks, which are aborted.
- **A module is known by its name.** Mounting a module whose name is taken replaces the mounted one. That is what hot reload needs: see [hmr.md](hmr.md).
- **The registry.** If `createCommands(bus)` was called, that registry is used; otherwise `registerModules` attaches its own. Either way it is `bus.commands` and `app.commands`, so the commands that modules bind are the ones the bus runs.
- A disposed app cannot mount modules.
- A module context is a task context plus `handle` (give a command a handler: for a contract, or to override), `use` (bring sub-modules and commands that carry a handler: `m.use(getUser, saveUser, subModule)`, in any order; the returned function undoes just that call) and `spawn` (a background task, aborted on unmount).
- A command that carries a handler keeps answering after its module is unmounted: the handler is its own, and `use` only brings the command and tracks it in the registry. Use `handle` for a handler that should live only as long as the module.
