# Tasks

## 1. Redux

- [x] 1.1 `src/store/redux/middleware.ts` and `effects.ts`: add `traceId` and `traceGroupId` to the options, send each action through the function under `originKey` when it is there and with `bus.emit` otherwise; tests in `src/store/redux/*.test.ts` for the scenarios of `specs/redux-effects-middleware/spec.md` (a root named by `traceId`, named by the action type, no plugin, `onError` unchanged, the loop guard unchanged); verify `pnpm vitest run src/store`.

## 2. Decorators

- [x] 2.1 `src/oop/decorators.ts`: `@On` and `@Once` take `(event, wrap?, options?)` and accept the options as the second argument when it is an object; keep `options` in the record of the method and pass it to the `on` or `once` of the instance; update the overloads and the types; tests in `src/oop/decorators.test.ts` (named method, `wrap` with options, no plugin, both kinds of decorators); verify `pnpm vitest run src/oop` and `pnpm tsgo`.

## 3. The notrace build and the places that pass options on

- [x] 3.1 Add a test of the `notrace` build to `src/trace/plugin.test.ts` for the scenario of `specs/trace-plugin/spec.md`: stub `__NANOEFFECTS_TRACE__` false, reset the modules, import again, and check the methods of the bus, a handler with `{ traceId }`, and that the tracer sees nothing.
- [x] 3.2 Keep the tests of a module `on`, `extendBus` and `matchPlugin` with options (they exist) and add one for `matchPlugin`; verify `pnpm vitest run src/trace src/match`.

## 4. Docs and release notes

- [x] 4.1 `docs/tracing.md`: say that `bus.emit` inside a handler starts a new root with no parent while `ctx.emit` keeps the chain, and list where `traceId` works (emitters, Redux, modules, classes); `docs/stores.md` the options of the middleware; `docs/oop.md` the decorator options; verify `pnpm docs:check`.
- [x] 4.2 `CHANGELOG.md` under `Unreleased`; verify `pnpm llms:check`.
- [x] 4.3 Run `pnpm size`; check `createBus` is at most 1265 B and the limits hold, raise a limit only by the measured amount.
- [x] 4.4 Run `pnpm verify`; verify all pass.

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
