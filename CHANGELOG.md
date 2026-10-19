# Changelog

## 0.1.0

First release.

- `createBus`: typed event bus; each handler is a task with a context (`signal`, `abort`, `emit`, `on`, `off`, `run`).
- Policies (`nanoeffects/policies`): `latest`, `leading`, `debounce`, `throttle` (lodash-compatible), `queue`, `key` option.
- Effects (`nanoeffects/effects`): `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `cancellable`, `onAbort`. `retry`, `timeout` and `poll` also wrap a Task, `retry(task, options)`, `timeout(ms, task)`, `poll(ms, task, options)`, so they go into `on(...)` with the policies and run with `ctx.run(...)`; the `ctx`-first calls are unchanged.
- Actions, commands, jobs and modules (`nanoeffects/actions`). The registry of command handlers is attached to a bus with `createCommands(bus)`; in a module `m.use(...)` brings sub-modules and commands that carry a handler, and `m.handle` gives an explicit handler.
- Tracing (`nanoeffects/trace`) with Redux DevTools, console and performance loggers, and the `notrace` build.
- Redux adapters (`nanoeffects/redux`): `createEffectsMiddleware`, `nanoeffectsMiddleware`.
