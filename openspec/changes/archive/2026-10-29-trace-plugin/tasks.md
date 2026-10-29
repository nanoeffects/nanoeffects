# Tasks

## 1. Back out the call from core

- [x] 1.1 Remove `call` from `emit`, `callHandler` and `createTask` (`src/core/bus.ts`, `src/core/context.ts`) and the third parameter of `Tracer.task` (`src/core/tracer.ts`); keep the optional `traceGroupId` of the event type; check `pnpm tsgo` and that `createBus` is at most 1292 B brotli (the `store.clear` change stays).
- [x] 1.2 Add `src/core/trace-call.ts` (a setter and a getter of the call that is being emitted, no import from the rest of core) and the key file `src/core/origin-key.ts` (`Symbol.for("nanoeffects.origin")` and the type of the function); `createTracer` reads the group from the scope of the current call instead of the removed `call`; verify `pnpm vitest run src/trace`.

## 2. tracePlugin

- [x] 2.1 Add `src/trace/plugin.ts`: `tracePlugin()` returns the same bus; it returns at once without `bus.trace` or when `TRACE` is false; it wraps `bus.emit` to set and restore the current call in a `finally`; it puts the root function (`emitFrom`, moved from `src/core/origin.ts`) on the bus under the key; export from `src/trace/index.ts`; tests for the nested call, a throwing handler and the same bus.
- [x] 2.2 Named listeners: wrap `on` and `once` for `{ traceId }` by renaming the task of the listener (`renameTask`, an optional `rename` of `Tracer`) and `traceRun`; keep a `WeakMap` handler to wrappers for `off`; leave a handler with no options untouched; tests for the scenarios of `specs/trace-plugin/spec.md` (two named listeners, a command below one, `off`, `once`, a throwing and a rejecting listener with `onError`, no tracer, a throwing logger).
- [x] 2.3 Add the optional third parameter `{ traceId?: string }` to every overload of `On<E>` (and so `once`) in `src/core/bus.ts`; a type test that the same code compiles with and without the plugin and that a wrong option is a type error; verify `pnpm tsgo`.

## 3. The emitters

- [x] 3.1 `useEmitter` (`src/react/plugin.ts`) and `bus.emitter` (`src/actions/emitter.ts`) read the key each time and call it, or `bus.emit` when it is absent; delete `src/core/origin.ts`; update their tests so the tracing ones use `tracePlugin` and add the no-plugin case; verify `pnpm vitest run src/react src/actions`.
- [x] 3.2 Plugin matrix: add an installer for `tracePlugin` and probes (the group from a scope, the root of an emitter, a named listener, `off` of a named listener) in `src/tests/plugin-matrix.test.ts`; verify it passes in every order.
- [x] 3.3 A "turned off" suite in `src/tests/`: the same code run with the plugin, without it, without a tracer and with the `notrace` build flag, and the results, throws, rejections and `onError` calls are equal.

## 4. Docs, sizes, release notes

- [x] 4.1 `docs/tracing.md`: say that `traceId` and `traceGroupId` need `bus.use(tracePlugin())` and are ignored without it, add "Name a listener", and how to turn it off; `docs/plugins.md` a row for `tracePlugin`; `docs/stores.md`, `docs/package.md`, `llms.txt`; verify `pnpm docs:check` and `pnpm llms:check`.
- [x] 4.2 `CHANGELOG.md`: the plugin, and that `traceId` and `traceGroupId` need it; sizes.
- [x] 4.3 `pnpm size`: `actions` back to 2.87 kB and `react` to 1.18 kB, `createBus` at most 1292 B, a limit for `trace` only by the measured amount.
- [x] 4.4 Run `pnpm verify`; verify all pass.

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
