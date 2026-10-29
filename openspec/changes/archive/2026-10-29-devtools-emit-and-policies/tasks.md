## 1. Check the events

- [x] 1.1 Run a bus with `latest` + `retry` + a nested `ctx.emit` through `createTraceRecorder` and write down the `parentId`/`rootId` of each event. Result: the listener task is silent, a policy task is its child (`parent=1 root=1`), a plain listener leaves no event; the design is updated to report the emit from `tracePlugin`.

## 2. The emit event

- [x] 2.1 `src/core/types.ts`: add `"emit"` to `EffectName` (type only; `pnpm size` unchanged).
- [x] 2.2 `src/trace/plugin.ts`: in the wrapper of `bus.emit`, make a leaf task (parent `currentEmitter()`, inside `withCall`), report `emit`/`done` with the event name and payload, `unlink()`, then emit as before. Tests in `src/trace/plugin.test.ts` for each scenario of the `trace-plugin` delta: no listener, plain listener, nested `ctx.emit` (parent), command, `traceGroupId`, other events unchanged with and without the plugin, no plugin / no tracer / `notrace` build report nothing, `emit` still returns and throws as before.
- [x] 2.3 `src/tests/plugin-matrix.test.ts`: add a probe that the event comes in every order; run the matrix.

## 3. Logger

- [x] 3.1 `src/trace/redux.ts`: add `policies` (`true | Phase[] | ({ effect, phase }) => boolean`) to `ReduxDevtoolsOptions` with a doc comment and `@example`; normalize it to one predicate.
- [x] 3.2 Send events with `effect: "emit"` always (action `type` = event name, not in `running`, no filter); filter level-`0` tasks by `policies`; keep effects on `depth`/`starts`; default `depth` for effects to `0`; `error` bypasses all filters. Tests: default, `true`, array, function, error with each, `starts`, `depth: 1`, the running state shows only what is shown.
- [x] 3.3 Update the existing `reduxDevtools` tests to the old lines through `policies: true, starts: true, depth: Infinity`; keep the `traceGroupId`/`rootId` assertions (`trace-group` spec). Add an end to end test on a bus with `tracePlugin`: two emits of `search` with a `latest` handler give two `search` actions by default.

## 4. Docs and release notes

- [x] 4.1 `docs/tracing.md` "Configure Redux DevTools": the recipe uses `.use(tracePlugin())`, default = emits only, what the list looks like, `policies` in its three forms with a use case (`["cancel", "drop"]`), `error` always shown, the emit needs the plugin. Run `pnpm docs:check` and `pnpm llms:check`.
- [x] 4.2 `CHANGELOG.md` under `Unreleased`: the `emit` event of the plugin, the default output of `reduxDevtools` changed (**breaking** for the log), how to get the old one.
- [x] 4.3 `examples/playground-devtools/` is left as it is: it installs `nanoeffects` from npm (`^0.8.0`), which has neither `tracePlugin` nor `policies`. Bump its dependency and show the new default after the release.

## 5. Follow-ups

- [x] 5.1 Make the emit event with `tracer.task`/`report` and no context; measure 300 000 emits before and after.
- [x] 5.2 `reduxDevtools` warns once when a handler task ends with no emit before it; tests for both outcomes.
- [x] 5.3 Tests: the emit under the root of an emitter with `traceId`, and the outcomes of a job as emits. Docs say jobs make several emits and give the cost.

## 6. Verify

- [x] 6.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`; `pnpm size` must not change. Then `pnpm verify`.
