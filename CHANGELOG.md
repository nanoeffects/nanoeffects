# Changelog

## 0.1.0

First release.

- `createBus`: typed event bus; each handler is a task with a context (`signal`, `abort`, `emit`, `on`, `off`, `run`).
- Policies (`nanoeffects/policies`): `latest`, `leading`, `debounce`, `throttle` (lodash-compatible), `queue`, `key` option.
- Effects (`nanoeffects/effects`): `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `cancellable`, `onAbort`. `retry`, `timeout` and `poll` also wrap a Task, `retry(task, options)`, `timeout(ms, task)`, `poll(ms, task, options)`, so they go into `on(...)` with the policies and run with `ctx.run(...)`; the `ctx`-first calls are unchanged.
- Actions, commands, jobs and modules (`nanoeffects/actions`).
- Tracing (`nanoeffects/trace`) with Redux DevTools, console and performance loggers, and the `notrace` build.
- Redux adapters (`nanoeffects/redux`): `createEffectsMiddleware`, `nanoeffectsMiddleware`.
