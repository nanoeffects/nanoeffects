# Proposal

## Why

`retry`, `timeout` and `poll` take `ctx` as the first argument, so a handler that uses them repeats `ctx` and cannot put them next to the policies in `bus.on(...)`. TypeScript has no parameter decorators for plain functions, and an ambient "current task" is lost after the first `await`. The unit that already composes is the Task `(payload, ctx) => R`: policies turn a Task into a Task, and `ctx.run(task, payload)` runs one as a child.

## What Changes

- `retry(task, options)`, `timeout(ms, task)` and `poll(ms, task, options)` accept a Task and return a Task, next to the existing `retry(ctx, fn, options)`, `timeout(ctx, ms, starter)` and `poll(ctx, fn, ms, options)`. Both forms stay.
- A Task made this way composes with the policies and with itself: `bus.on("typed", latest(retry(timeout(5000, search), { times: 3 })))`.
- `ctx.run(retry(search, { times: 3 }), query)` runs the wrapped Task as a child of the handler, so `ctx` is written only where a child task is started.
- No change for `take`, `all`, `allSettled`, `race`, `delay` and `cancellable`: they wait inside a handler body, so a `ctx`-first call is the natural form.
- `docs/guide.md`, `docs/effects.md` and `examples/guide.ts` show the Task form first and the `ctx` form for a single call inside a body.

## Capabilities

### New Capabilities
- `effect-composition`: `retry`, `timeout` and `poll` as wrappers of a Task, their equivalence with the `ctx`-first calls, and how they compose with policies and `ctx.run`.

### Modified Capabilities

## Impact

- Code: `src/effects/retry.ts`, `timeout.ts`, `poll.ts`; a shared helper for "a Task as the body of a group" in `src/effects/`. No change to `src/core` or to `createBus` (1.2 kB limit stays).
- Size: the `effects` entry grows by a small amount; its limit in `package.json` is raised only if the measured size needs it.
- Tests: new tests for the Task form, for composition and for abort and trace; the existing tests of the `ctx` form stay and must keep passing.
- Docs: `docs/guide.md`, `docs/effects.md`, `examples/guide.ts`, `CHANGELOG.md` (the package is not released yet, so the entry goes under `0.1.0`).
- Types: overloads on three functions; `src/tests/types.test.ts` gets cases for both forms.
