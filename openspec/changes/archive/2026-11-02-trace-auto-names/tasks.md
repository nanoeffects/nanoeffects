# Tasks

## 1. Name an anonymous listener by its place

- [x] 1.1 In `src/trace/plugin.ts`, make an unnamed listener's name `event#n` (a counter for each event key, taken once in `wrapperOf`, never reused) for a string key; verify with a test in `src/trace/plugin.test.ts` that two inline listeners on one event are `event#1` and `event#2` and that the `source` field is unchanged
- [x] 1.2 Add tests for the other scenarios of the spec delta (named function and `traceId` keep their names, no stack still gives `event#1`, a removed number is not reused, option off changes nothing, predicate listener) and verify `src/tests/plugin-matrix.test.ts` and `src/trace/source-wrappers.test.ts` still pass in every order
- [x] 1.3 Add a `graphLogger` test: two inline listeners on one event give two nodes; verify it passes

## 2. Docs and changelog

- [x] 2.1 Update the `source: true` section of `docs/tracing.md` (an anonymous listener is named `event#n`, the place stays in `source`, and a `traceId` keeps a name when calls are reordered) and the same section of `docs/ru/tracing.md`; verify `pnpm docs:check` and `pnpm llms:check` pass
- [x] 2.2 Add a `### Changed` bullet under `Unreleased` in `CHANGELOG.md`, including that old snapshots do not merge for these nodes

## 3. Verify

- [x] 3.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm size` to confirm `createBus` and the `trace` entry limits hold
