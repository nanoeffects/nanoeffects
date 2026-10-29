# Design

## Context

`useEmitter` (`src/react/plugin.ts`) and `bus.emitter` (`src/actions/emitter.ts`) call `bus.emit(action)` from outside a task. In a trace that makes an event with no `parentId`. The causal parent of everything below comes from `currentEmitter()`, which `ctx.emit` of a task context sets for the time of the synchronous emit (`src/core/context.ts`). The tracer reports only what the effects, policies and commands report (`traceTask`, `traceRun`); a plain listener is not a traced event, so the first link of a chain is invisible. The loggers print `type · effect phase`, with the payload as an extra argument (`src/trace/console.ts`). `createTracer` (`src/trace/tracer.ts`) keeps a `Ref` per task with its id and its parent's id, and is given the parent `Ref` for each new task, which is where an inherited value can come from. A command call carries its scope under a symbol (`src/core/scope-key.ts`, `carry`), and `createTask` passes the emitted action as the `event` of `tracer.task`, so the tracer can read the scope of a call without help from the bus. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- A root node that names the subscription that began a chain, for `useEmitter` and `bus.emitter` (`traceId`).
- A key that names a whole flow and follows it through every task it starts (`traceGroupId`).
- No cost without a tracer, none in `createBus`.
- One mechanism for the two emitters, so a third caller can use it later.

**Non-Goals:**
- Automatic component names or call sites.
- The Redux middleware and `extendBus` (the same helper can serve them later).
- A `traceGroupId` in the options of a call to `emit`.

## Decisions

**A real task, made by `createTask`, emits.** The helper makes a task context with `createTask({ event, bus, tracer: bus.trace })`, reports `run` as started with `traceTask`, emits the action with the `ctx.emit` of that task, and reports `done` (or `error` and rethrows). `ctx.emit` sets `currentEmitter()` to the task for the time of the emit, so every task that the event starts becomes its child with no new hook in core. Alternative: a new field in every trace event filled by the emit (rejected: needs a context passed through `emit`, as `signalPlugin` does).

**The root uses the existing effect `run`; no new effect name.** `run` is what `ctx.run` reports for a child step, and a root that runs the emit of a subscription fits it. A new name would grow the union of `EffectName` and every logger and filter that lists the names. The `traceId` tells roots apart, not the effect.

**`traceId` is the type of the root.** The loggers print the type first, so `Profile · run start` is readable in the console, in the performance marks and in the Redux DevTools without a change. The payload is the action, as for any other task. Without `traceId` the type is the type of the event, so a chain still has a visible root. The `trace` prefix says that the value is for the trace only (it is not a policy `key` and not a field of the context), and `Id` that it is an identifier you keep stable, not a free caption. It is not the numeric `id` that the tracer gives each task: that one is made by the tracer, this one by you.

**`traceGroupId` is kept and inherited by the tracer.** `Tracer.task(event, parent, call)` already gets the parent `Ref`. `createTracer` stores `group` in the `Ref` as the group the task declares, or else its parent's, and puts `traceGroupId` in each `TraceEvent` of the task when it is set. A task started by `ctx.emit`, `ctx.run`, a policy or an effect always has its parent task as `parentId`, so the key follows all of them.

**One small change in core: the emitted call goes to the tracer.** `bus.emit` builds a fresh `{ type, payload }` for the task, so the scope that a command call or an action call carries (under `scopeKey`) was not visible to the tracer. `emit` now passes the original call as `call` to `createTask`, which gives it to `tracer.task` as a third argument. This costs about 20 bytes of `createBus`, over a budget that had 8. They were found elsewhere in core: `store.clear` drops its two maps by assigning new ones instead of deleting every key, which is shorter and does the same (lists that `get` handed out stay as they were). `createBus` is 1292 B brotli, the same as before this change.

**`rootId` links a task to the root of its chain.** `createTracer` keeps `root` in the `Ref` (the id of the root: its own, or its parent\u2019s) and puts `rootId` in the events of every task that is not a root. The listener hop does not matter, since the `Ref` of a listener is the parent that the next task is given, reported or not. It is an addition: `parentId` keeps its meaning.

**The `parentId` of a task below a listener points to the task of the listener, which reports nothing.** A listener task is traced only when it uses a policy or an effect, so for `useEmitter` → listener → command the `parentId` of the command is the id of the unreported listener, not of the root. That is how `parentId` works for every chain today, and the tests that pin it stay. The root still makes the chain readable in the log: it is the line above, and `traceGroupId` joins the lines of a flow whatever the hops. `rootId` joins the line to the root. Resolving a `parentId` to the nearest reported task was tried and dropped, because it changes the meaning of `parentId` for every logger.

**Where a call declares it.** In the scope of the creator, the last argument: `createCommand(type, handler, { traceGroupId })`, the fourth of `createJob` after its outcomes, the last of `createAction`. The scope is already carried on the call under `scopeKey`, so the tracer reads `Reflect.get(event, scopeKey)?.traceGroupId` from the action it is given, with no change to `createCommand` beyond allowing a scope when there is no handler (the second overload takes `handler | undefined`). For the two emitters, whose root is made by the helper, the helper puts `traceGroupId` on the `event` it gives to `createTask`, and the tracer reads that field first. Alternative: a fourth plain option of `createCommand` (rejected: the scope is the place for what the call carries, and it is one more argument shape).

**`traceGroupId` is a reserved key of a scope.** `scopePlugin` already has a set of reserved names (`signal`, ...) that it never puts on the context; `traceGroupId` joins it. It is for the tracer, so it also works without `scopePlugin`, because `carry` puts the scope on the call whether or not the plugin runs. The spec of scope-context is changed for it.

**The console shows it.** `consoleLogger` prints `[checkout]` after the prefix when the event has a `traceGroupId`. Other loggers receive the field in the event and may ignore it.

**What the task sees of the bus.** `createTask` takes the parts of the bus that a task forwards to (`emit`, `on`, `off`, `ctx`, `addContext`). The helper passes the bus itself and reads `bus.addContext` and `bus.ctx` when it runs, not when the plugin is used, so plugins used later are seen and the plugins work in any order (see the matrix tests).

**No tracer, no task.** `if (!bus.trace)` the helper calls `bus.emit(action)` and returns. The check reads one property. In the `notrace` build `bus.trace` is never set, so the same path runs.

**Where the helper lives.** `src/core/origin.ts`, imported by `src/react/plugin.ts` and `src/actions/emitter.ts`, not by `bus.ts`, so `createBus` is not affected and `src/core` still imports nothing above it. Each entry bundles it through the shared chunk; the sizes of `react` and `actions` are measured.

**Options as an object, now.** `useEmitter(event, value, { equals, traceId, traceGroupId })` and `bus.emitter(creator, { traceId, traceGroupId })`. The third argument as a function is dropped without a deprecation, since the package is 0.x and the old form is one call in a typical app; the type error names the fix. Alternative: accept both (rejected: a union of a function and an object makes the overloads and the docs harder for a feature that is one release old).

## Risks / Trade-offs

- [Breaking `useEmitter(event, value, equals)`] → a type error in TypeScript; the changelog and the docs say `{ equals }`. JavaScript callers get no error: a function in the place of the options object is read as an object without the fields, so `equals` is ignored and `Object.is` is used. The test pins it, and the docs of `useEmitter` say so.
- [A `traceGroupId` that is not unique, or used for two flows] → it is a string you choose; the docs advise a name per flow and say that the nearest one wins.
- [`traceGroupId` as a key of a scope hides a context field of that name] → reserved and documented in the scope page; a scope that used `traceGroupId` as a field of its own gets `undefined` now, which is a behavior change noted in the changelog.
- [Extra task per emit when tracing] → only with a tracer; the tracer samples per root task, so a sampled-out root costs one `task` call.
- [`createTask` costs more than `bus.emit`] → paid only with a tracer.
- [A logger that spreads the event and now gets `traceGroupId`] → the field is optional and absent without a group, so loggers that do not know it are unchanged.
