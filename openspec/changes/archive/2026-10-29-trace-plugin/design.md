# Design

## Context

`emit-source` (archived, not released) made the trace say where a chain began. To read the scope of a call the tracer needed the emitted call, so `bus.emit` now passes it as `call` to `createTask` and on to `Tracer.task` (core, about 20 bytes), and `emitFrom`, which makes the root of an emitter, is imported by `react` and `actions` (their bundles grew by 0.16 kB and 0.12 kB). `matchPlugin` shows how a plugin wraps `on`, `once` and `off` and keeps a map to find the wrapper again. `signalPlugin` and `scopePlugin` wrap `emit` and chain `bus.addContext`. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- Everything that names or groups a trace task lives in `tracePlugin`; core and the entries that do not use it do not pay.
- Naming a listener when it is registered.
- Turning it off breaks nothing, and does not change types.

**Non-Goals:**
- A `production` export build of `nanoeffects/trace`, the Redux middleware, `extendBus`, automatic names.

## Decisions

**The call that is emitted is known through a module variable, not through core.** `tracePlugin` wraps `bus.emit` and, for the synchronous time of the call, sets a variable in a small file of `src/core` (`trace-call.ts`: a setter and a getter, like `currentEmitter()` of `context.ts`; `createBus` does not import it). The tracer reads it in `Tracer.task` to take `traceGroupId` from the scope the call carries (`scopeKey`). A task is always made during the synchronous part of `emit`, so the variable is right for the listeners and for the command of that emit; nested emits restore the outer call in a `finally`. This removes `call` from `bus.ts`, `context.ts` and `Tracer.task`, which keeps the contract of a tracer that you wrote yourself. Alternative: wrap `tracer.task` from the plugin (rejected: it changes a tracer that can be shared by two buses and would wrap it twice).

**One variable for all buses is fine.** The variable is set and cleared inside one synchronous emit, so two buses in one page cannot see each other's call.

**The root of an emitter is made by a function on the bus under a shared key.** `tracePlugin` puts `emitFrom(action, options)` (the code of `src/core/origin.ts`, moved to `src/trace/`) on the bus under `Symbol.for("nanoeffects.origin")`; the key is declared in a file of `src/core` with no code, as `scopeKey` is. `reactPlugin` and `emitterPlugin` read it with `Reflect.get(bus, key)` each time they emit, and call `bus.emit(action)` when it is not a function. Reading each time makes the order of plugins free: a plugin used after `reactPlugin` is seen. The entries `react` and `actions` no longer import `createTask`.

**A listener is named by a wrapper, found again by `off`.** `tracePlugin` wraps `on` and `once` like `matchPlugin` does: with `{ traceId }` and a tracer it registers a wrapper that renames the task of the listener with `renameTask(ctx, traceId)` (an optional `rename` of the tracer), reports `run` on that same task with `traceRun`, and calls the handler with the context it was given. A child task with `forkTask` was the first idea and was dropped: the child forwards `emit` to the parent, so what the listener emits would not be below it, and a context made for the child would miss the fields that `scopePlugin` adds to the context of the listener. Without `{ traceId }` it passes the handler on untouched. A `WeakMap` from the handler to its wrappers (one per event) lets `off(event, handler)` remove the wrapper, and `off(event)` and `off()` need nothing because they remove all. Because the task of the listener is the node that reports, what the listener emits is below a task that the log shows, so the link that was lost at an unreported listener is whole for a named one. A tracer that has no `rename` keeps the type of the event; `matchPlugin` passes the options on to the method below it. `once` is registered as `once` of the wrapper, so it runs once and is reported once.

**The options are in the types of the bus.** `On<E>` gets an optional third parameter `{ traceId?: string }` on each overload; the types of `useEmitter` and `bus.emitter` already have the options. It is only a type: `bus.on` of core ignores a third argument. This makes `tracePlugin` return the same bus type, so `if (traced) bus.use(tracePlugin())` compiles the same, and code that passes options is valid without the plugin.

**No `production` export build.** `nanoeffects/dev` has one because everything in it is a diagnostic. `nanoeffects/trace` also holds the loggers that the docs use in production (sampling, Redux DevTools), so a no-op `production` build would turn them off. The off switch is not to use the plugin, or not to give the bus a tracer: with no tracer the plugin returns at once, wraps nothing and costs nothing at runtime, and the `notrace` build removes the tracer (`TRACE` false), which makes `bus.trace` undefined.

**What is kept from `emit-source`.** `rootId`, `parentId`, the loggers, the `traceGroupId` field of an event, the reserved scope key and the `store.clear` that is shorter stay as they are.

## Risks / Trade-offs

- [`traceGroupId` of a scope is ignored without `tracePlugin`] → documented, and the type does not change; `emit-source` is not released, so no user has it yet.
- [A module variable for the call] → set and cleared in one synchronous emit with a `finally`, tested for nesting and throwing handlers.
- [A named task is renamed after it is made] → `rename` changes the `type` of the `Ref` before the first report of that task, and only for a tracer that has it.
- [Two registrations of one handler on one event with different ids] → the wrappers are a list per handler and event; `off` removes the last, like `off` of core removes one.
- [The order of plugins] → covered by `plugin-matrix`, with probes for the group, the root and the named listener, and the plugin does nothing at `bus.use` that a later plugin could miss.
