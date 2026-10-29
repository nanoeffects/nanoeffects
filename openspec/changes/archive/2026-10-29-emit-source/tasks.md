# Tasks

## 1. traceGroupId in the tracer

- [x] 1.1 Types: add `traceGroupId?: string` to the `event` of `Tracer.task` (`src/core/tracer.ts`), to the `event` of `TaskInit` in `src/core/context.ts`, and to `TraceEvent` (`src/core/types.ts`); check `pnpm tsgo` and that `createBus` does not grow (`pnpm size`).
- [x] 1.2 `createTracer` (`src/trace/tracer.ts`): store `group` in the `Ref` as `event.traceGroupId ?? the traceGroupId of the scope carried by event (Reflect.get(event, scopeKey)) ?? parent.group`, put `traceGroupId` in each `TraceEvent` of the task when it is set, and keep it absent otherwise; add tests in `src/trace/tracer.test.ts` for the scenarios of `specs/trace-group/spec.md` (declared in a command scope, inherited through `ctx.emit` and `ctx.run`, nearer group wins, two roots with one group, no group); verify `pnpm vitest run src/trace`.
- [x] 1.3 `consoleLogger` prints `[traceGroupId]` after the prefix when the event has one; test it in `src/trace/loggers.test.ts`; verify the other loggers are unchanged.
- [x] 1.4 Scope: reserve `traceGroupId` in `src/scope/plugin.ts` (it is not put on the context) and let `createCommand` take a scope when there is no handler (second overload takes `handler | undefined`); also check `createJob` and `createAction` carry it; tests in `src/scope/*.test.ts` and `src/actions/command.test.ts` (not on `ctx`, works without `scopePlugin`); type tests in `src/tests/types.test.ts`; verify `pnpm vitest run src/scope src/actions`.

## 2. The root of an emitter

- [x] 2.1 Add `src/core/origin.ts` with `emitFrom(bus, action, options)`: without `bus.trace` call `bus.emit(action)`; with it make the task with `createTask` (type `traceId` or the type of the action, payload the action, `traceGroupId` on the event), report `run` `start`, emit with `ctx.emit`, report `done` or `error` and rethrow; add `src/core/origin.test.ts` for the scenarios of `specs/emit-origin/spec.md` (root with children, no `traceId`, no tracer, error) using the recorder logger; verify `pnpm vitest run src/core/origin.test.ts`.
- [x] 2.2 Check that `createBus` does not import it (the size of `createBus` is unchanged by `pnpm size`) and that the architecture test passes.

## 3. The two emitters

- [x] 3.1 `useEmitter` in `src/react/plugin.ts`: the third argument is `{ equals?, traceId?, traceGroupId? }`; emit through `emitFrom`; update the overloads and `Equals`; update `src/react/plugin.test.ts` (the options object, `traceId`, `traceGroupId`, a function in its place) and `src/tests/types.test.ts` (the function is a type error, the object is fine); verify `pnpm vitest run src/react`.
- [x] 3.2 `bus.emitter(creator, options?)` in `src/actions/emitter.ts` with `{ traceId?, traceGroupId? }`, through `emitFrom`; update its tests and the type tests; verify `pnpm vitest run src/actions`.
- [x] 3.3 Add a probe for a traced emitter with `traceId` and `traceGroupId` to `src/tests/plugin-matrix.test.ts` if a probe for `emitterPlugin` exists, and check that the plugin works in every order; verify `pnpm vitest run src/tests/plugin-matrix.test.ts`.

## 4. Docs and release notes

- [x] 4.1 Change the `useEmitter` snippets of `docs/stores.md` and `docs/plugins.md` and any `examples/` that pass `equals` as a function; add sections "Show which subscription began a chain" (`traceId`) and "Follow one flow" (`traceGroupId`) to `docs/tracing.md` with a console log of each; say in `docs/scope.md` that `traceGroupId` is reserved; verify `pnpm docs:check`.
- [x] 4.2 Add an entry under `Unreleased` in `CHANGELOG.md` (mark **Behavior change** for the third argument of `useEmitter` and for `traceGroupId` as a reserved key of a scope); update `llms.txt` if a line names `useEmitter`; verify `pnpm llms:check`.
- [x] 4.3 Run `pnpm size`; raise the limits of `react`, `actions` and `trace` only by the measured amount; check `createBus` is untouched.
- [x] 4.4 Run `pnpm verify`; verify all pass.

## 5. rootId

- [x] 5.1 `createTracer`: keep `root` in the `Ref`, put `rootId` in the events of a task that is not a root; add `rootId?: number` to `TraceEvent`; tests in `src/trace/trace-group.test.ts` for the scenarios of the spec (a command below a listener, a root with none, the same through a policy); verify `pnpm vitest run src/trace`.
- [x] 5.2 Rename the `parent` field of `TraceEvent` to `parentId` in the types, `createTracer`, the three loggers and their tests, and in `docs/tracing.md`; say what `rootId` is in `docs/tracing.md` (the table of fields and the section on `traceId`) and in `CHANGELOG.md`; verify `pnpm docs:check`.
- [x] 5.3 Run `pnpm verify`; verify all pass.

## 6. The loggers and the notes

- [x] 6.1 `performanceLogger`: put `traceGroupId` and `rootId` in the detail when they are set; `reduxDevtools`: add `traceGroupId` to the running tasks of the state (the actions it sends already spread the event); tests in `src/trace/loggers.test.ts`; verify `pnpm vitest run src/trace`.
- [x] 6.2 Docs: in `docs/tracing.md` say that the `type` of the root of an emitter is its `traceId`, so a `sample` function that matches on `type` sees it, and that `bus.emit` inside a handler starts a new root while `ctx.emit` keeps the chain; note the `sample` change in `CHANGELOG.md`; verify `pnpm docs:check`.
- [x] 6.3 Run `pnpm verify`; verify all pass.

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
