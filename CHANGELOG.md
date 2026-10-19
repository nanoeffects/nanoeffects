# Changelog

## Unreleased

- **BREAKING:** Calling a command or job, `command(payload)`, builds `{ type, payload }` like `createAction` and no longer runs the handler. Use `bus.emit(command(payload))` (or still `bus.emit(command, payload)`) for the result.
- Removing listeners no longer slows down as their number grows: unsubscribing 50 000 listeners in the order they were added took seconds and now takes milliseconds.

## 0.3.0

- **BREAKING:** `createJob` returns the command itself, with the action creators of its outcome as properties, `job.success` and `job.fail`; `{ command, successAction, failAction }` is gone. Options, defaults and routing are unchanged.
- **BREAKING:** `createCommands(bus, bindings?)` is replaced by `bus.use(commandsPlugin(bindings?))`, the same form as `modulePlugin` and `devPlugin`; the registry it returns is unchanged.
- A command has `match(action)`, as an action creator has: it tells whether an action has the type of the command and narrows its type.

## 0.2.1

- **BREAKING:** `nanoeffectsMiddleware` is no longer exported from `nanoeffects/redux`; `createEffectsMiddleware` is the one entry, and its `bus` takes modules, tracing and the rest (`effects.bus.use(...)`).

## 0.2.0

- **BREAKING:** `registerModules(bus, modules)` is replaced by `bus.use(modulePlugin(modules))`; `bus.use(plugin)` calls a plugin, a function of the bus, and returns what it returns.
- **BREAKING:** `createJob(type, handler, { success, fail })` returns `{ command, successAction, failAction }`; a string makes the action creator (a missing one gets `<type>/success` or `<type>/fail`), a creator that was given is returned as it is, and an error of the handler is always handled. The option `done` is now `success`, and a command or a plain action is no longer a target.
- **BREAKING:** `createBus` has no `commands` option: `createCommands(bus, bindings?)` attaches the registry to a bus and returns it.
- `m.use(...)` in a module brings commands that carry a handler as well as sub-modules.
- `retry`, `timeout` and `poll` also wrap a Task, so they go into `on(...)` with the policies and run with `ctx.run(...)`.
- `nanoeffects/dev`: `bus.use(devPlugin({ app }))` warns about listeners that pile up and reports modules that are mounted, replaced and unmounted. In a production build it is a no-op (the `production` export condition).
- `reduxDevtools` is quiet by default: a task is one action, when it ends (`starts`, `depth`, `maxAge` to change that).

## 0.1.0

First release.

- `createBus`: typed event bus; each handler is a task with a context (`signal`, `abort`, `emit`, `on`, `off`, `run`).
- Policies (`nanoeffects/policies`): `latest`, `leading`, `debounce`, `throttle` (lodash-compatible), `queue`, `key` option.
- Effects (`nanoeffects/effects`): `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `cancellable`, `onAbort`. `retry`, `timeout` and `poll` also wrap a Task, `retry(task, options)`, `timeout(ms, task)`, `poll(ms, task, options)`, so they go into `on(...)` with the policies and run with `ctx.run(...)`; the `ctx`-first calls are unchanged.
- Actions, commands, jobs and modules (`nanoeffects/actions`). The registry of command handlers is attached to a bus with `createCommands(bus)`; in a module `m.use(...)` brings sub-modules and commands that carry a handler, and `m.handle` gives an explicit handler.
- Tracing (`nanoeffects/trace`) with Redux DevTools, console and performance loggers, and the `notrace` build.
- Redux adapter (`nanoeffects/redux`): `createEffectsMiddleware`.
