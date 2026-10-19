# Design

## Context

A Task is `(payload, ctx) => R`. Policies (`latest`, `debounce`, ...) take a Task and return a Task; `ctx.run(task, payload)` starts one as a child of the current task. The effects `retry`, `timeout` and `poll` are written as `effect(ctx, ...)`: they fork a traced group from `ctx` with `withGroup` and run each attempt through `runTraced(group, fn)`, which forks a `run` child but hands `fn` no context. See proposal.md for why the `ctx`-first call is awkward next to policies.

Constraints: `src/core` and `createBus` do not change (1.2 kB limit). Effects stay named exports of `nanoeffects/effects`, so a bundle that does not import one does not carry it. The `ctx`-first forms keep their behavior, and the tests of them stay as they are.

## Goals / Non-Goals

**Goals:**
- `retry`, `timeout` and `poll` usable as Task wrappers, in `on(...)` and in `ctx.run(...)`.
- One implementation per effect: the Task form and the `ctx` form share it.

**Non-Goals:**
- `take`, `all`, `allSettled`, `race`, `delay`, `cancellable`: they wait inside a body and have no Task to wrap.
- A new way to pass context (ambient context, methods on `ctx`, `ctx.use`).
- Exposing the attempt number or the call number in the Task form.

## Decisions

**1. The effect body takes a function of the child context.** `runTraced(group, fn)` passes the `run` child's context to `fn` (`fn(childCtx)`). The `ctx` form ignores it (`() => fn(attempt)` as now), the Task form uses it: `task(payload, childCtx)`. Each attempt therefore gets its own child context, which aborts with the group and so with the caller. Alternative: hand the Task the caller's own `ctx`. Rejected: an abort of one attempt (a timeout) would abort the caller, and the trace would lose the `run` child.

**2. The Task form is a thin wrapper over the shared body.** For each effect there is an internal function that takes `ctx` and a body `(childCtx) => result`; the `ctx` form calls it with a body that ignores `childCtx`, the Task form with `(payload, ctx) => effect(ctx, (child) => task(payload, child))`. No behavior is written twice. Alternative: implement the Task form by calling the public `ctx` form with `() => task(payload, ctx)`. Rejected: the attempt would run on the caller's context, with the problem of decision 1.

**3. The forms are told apart by the first argument.** `retry`: a function is the Task form, an object is `ctx`. `timeout`: a number is the Task form, an object is `ctx`. `poll`: a number or a function (the pause) is the Task form, an object is `ctx`. Contexts are objects, so the test is `typeof` and needs no brand. Alternatives: separate names (`retried`, `timeoutOf`), which doubles the vocabulary; a flag in options, which hides the form in the types.

**4. Types are overloads.** For example `retry<P, E, R>(task: Task<P, E, R>, options?): Task<P, E, Promise<Awaited<R>>>` next to `retry<T>(ctx, fn, options?): Promise<T>`. The result of the Task form is a Task, so `latest(...)`, `debounce(...)` and `ctx.run(...)` infer `P` and `E` from it as they do from a function.

**5. `timeout` passes a context, not a starter.** In the `ctx` form the starter gets `{ signal, abort }`; in the Task form the Task gets the full child context, whose `signal` aborts on the time limit. This is what a Task expects, and the `{ signal, abort }` part is a subset of it.

## Risks / Trade-offs

- [Overloads make the types and the messages of type errors harder to read] → type tests for both forms, and a check of the error message for a wrong first argument.
- [The `effects` entry grows] → measure with `pnpm size`; the limit is raised only if needed, and the change is reported in the CHANGELOG.
- [Two forms for one effect can confuse a reader] → the docs show the Task form first (`on`, `ctx.run`) and the `ctx` form as "for one call inside a body".
- [The attempt number is lost in the Task form] → documented; the `ctx` form passes it.

## Migration Plan

None: the package is not released, and no existing call changes. Docs and examples are rewritten to show the Task form first. If the Task form takes hold, the `ctx` form of these three effects can be removed in a later change.
