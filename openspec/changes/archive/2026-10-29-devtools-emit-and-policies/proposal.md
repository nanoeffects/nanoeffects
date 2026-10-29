# Proposal

## Why

`reduxDevtools` shows tasks as `type/effect/phase` (`search/latest/cancel`), so a reader sees policy internals first and never sees the emit that started the work. A first-time reader has to learn the effect names before the list makes sense. The default should be the story of the app (what was emitted), and the policy stages should be something you turn on when you debug a race, not something you turn off.

The trace has no event for an emit today: the task of a listener without a policy reports nothing, so an emit with such listeners, or with none, leaves no trace at all. A logger cannot rebuild the emit from the events it gets.

## What Changes

- **New trace event `emit`**: with `tracePlugin` on a bus that has a tracer, each emit reports one event `{ type: <event name>, effect: "emit", phase: "done", payload }`, before its handlers run. It covers emits that have no listener, listeners that report nothing, nested `ctx.emit`, and commands. It does not change the parent or the root of any other task. `"emit"` joins `EffectName` (a type only).
- **BREAKING (observable output of `reduxDevtools`)**: by default the logger sends the `emit` events (one action each, `type` = event name, with the payload) and the errors; it no longer sends the tasks of handlers and policies by default.
- New option `policies` on `reduxDevtools`: `true` (all phases), an array of phases (`["cancel", "drop"]`), or a function `({ effect, phase }) => boolean`. It adds the stages of handler tasks (actions `event/policy/phase`). `error` is always shown.
- `starts` and `depth` stay for the effects below a handler (`retry`, `timeout`, ...); their defaults change so that nothing but emits and errors is sent until the reader asks for more.
- Docs (`docs/tracing.md`), `CHANGELOG.md` and the tests follow. `consoleLogger` and `performanceLogger` also show the `emit` event when the plugin is used (a line / a mark), with no change in their code.

Out of scope: a hook in `createBus` for emits (the plugin already wraps `bus.emit`), one timeline with the store of the app, renaming the policy types, a fallback that rebuilds the emit when `tracePlugin` is not used.

## Capabilities

### New Capabilities
- `redux-devtools-trace`: what `reduxDevtools` sends to the extension: the emit actions, the opt-in policy stages, the filters, and the running state.

### Modified Capabilities
- `trace-plugin`: adds the `emit` event of each emit.

## Impact

- `src/trace/plugin.ts` (the event), `src/core/types.ts` (`EffectName`, a type only), `src/trace/redux.ts`, their tests (`src/trace/plugin.test.ts`, `src/trace/loggers.test.ts`), and the plugin matrix probe in `src/tests/plugin-matrix.test.ts`.
- `docs/tracing.md` ("Configure Redux DevTools"), `CHANGELOG.md` (`Unreleased`, marked as a change of output), `examples/playground-devtools/main.ts`.
- No change in the code of `createBus` or in the `Tracer` contract; `pnpm size` must not move.
- Cost: with `tracePlugin` and a tracer, one extra task per emit (a root task, as `emitFrom` makes); without the plugin or the tracer, none.
