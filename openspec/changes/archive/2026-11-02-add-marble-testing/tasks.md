# Tasks

## 1. Diagrams

- [x] 1.1 `src/testing/marble.ts`: parse an emit diagram and a phase diagram (idle, character, group), throw with the diagram and position on a bad character; render rows back to diagrams.
- [x] 1.2 `src/testing/marble.test.ts`: idle, characters with and without `values`, groups, bad characters, padding, rendering of groups.

## 2. The runner

- [x] 2.1 `src/testing/index.ts` (re-exports) and `src/testing/runner.ts`: `createMarbleBus`, `run`, the frame loop with `advance`, the frame of each event from `now`, rows `type:effect`, `rows()` and `expect` with the diff message; `src/testing/clock.ts`: `fakeTimersClock`.
- [x] 2.2 Tests: the timer at the edge of a frame, a group in one frame, a missing row, a difference, a key by effect alone and an ambiguous one, a custom clock, no import of a test runner in `src/testing`.
- [x] 2.3 Policy tests with diagrams: `latest`, `debounce`, `throttle`, `queue`, `retry`, `timeout` (and `leading`, `keyed` if cheap).

## 3. Entry

- [x] 3.1 `tsdown.config.ts` entry `testing`, `package.json` `exports` and `size-limit`, `src/tests/exports.test.ts`, the architecture test, `docs/package.md`; `pnpm build`, `pnpm size`, `pnpm smoke`, `pnpm lint:package`; `createBus` unchanged.

## 4. Docs

- [x] 4.1 `docs/testing.md` and `docs/ru/testing.md` (worked `latest` case, alphabet table, clock, `frames`, limits), the sidebar with its Russian title, `llms.txt`.
- [x] 4.2 `docs/recipes.md` and `docs/ru/recipes.md`: a task line; `docs/migrating-from-rxjs.md` and its Russian page: one line on marble tests.
- [x] 4.3 `examples/testing/` with a type-checked Vitest file of the worked case; `docs/examples.md` row if the examples list needs it.
- [x] 4.4 `docs/debugging-compared.md` and its Russian page: change the test row and the gap about marble tests.
- [x] 4.5 `CHANGELOG.md` under `Unreleased` (`### Added`).
- [x] 4.6 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm docs:site && pnpm vitest run && pnpm build`, then `pnpm verify`.
