# Tasks

## 1. Requests in devPlugin

- [x] 1.1 Add the request tracker to `devPlugin` (`AsyncLocalStorage` through `process.getBuiltinModule`, `enterWith` in `addContext`, the store put back after `bus.emit` and `ctx.run`, `fetch` patched and put back, the count at the abort), the kind `request` of `LostSignal`, and the option `requests`. Verify with tests in `src/dev/plugin.test.ts` for every scenario of the spec.
- [x] 1.2 Raise the `size-limit` of `dev` if needed, and verify `pnpm size`.

## 2. Bind the signal once

- [x] 2.1 Add `signalFetch` to `src/signal/` and export it from `nanoeffects/signal`. Verify with tests for every scenario of `signal-fetch`, and with `contextPlugin` and `fromSignal`.
- [x] 2.2 Add `requireContext` to the lint rule in `examples/lint/nanoeffects-lint.mjs`. Verify with tests in `src/tests/lint-recipes.test.ts`.

## 3. Docs

- [x] 3.1 Add a section on binding the signal once and on the counting of requests to `docs/pass-the-signal.md` and its Russian page; update `docs/context.md` for `signalFetch`; add the `CHANGELOG.md` entry. Verify `pnpm docs:check`.
- [x] 3.2 Run `pnpm verify`.
