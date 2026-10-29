## 1. Option

- [x] 1.1 `src/trace/redux.ts`: add `payload?: "all" | "essential" | "none"` to `ReduxDevtoolsOptions` with a doc comment (default `"essential"`, which phases it sends); leave the `payload` field out of an action by the rule of the spec. Tests in `src/trace/loggers.test.ts` for each scenario: default (emit and `cancel`/`drop`/`error` have it, `start`/`done` not), `"all"`, `"none"`, the other fields and the state unchanged, the same actions in the same order for the three values, an effect action follows the same rule by its phase. The old tests that read the payload of a `start` or `done` action use `payload: "all"`.
- [x] 1.2 `src/trace/redux-contract.test.ts`: with `"none"` a circular payload and a `BigInt` payload serialize in every action and report no failure; the test "repeats the payload in every action of a stage" uses `"all"`; add that with the default a `done` and a `start` have none and the size of the actions of a successful call is about one copy.
- [x] 1.3 `integration/devtools-chromium.test.ts` keeps passing (its `typed/debounce/drop` actions keep their payload by default); add an assertion of that.

## 2. Docs and release notes

- [x] 2.1 `docs/tracing.md` "Configure Redux DevTools": the `payload` option with its three values, which phases "essential" sends and why, the cost of `"none"`, and `"all"` as the way to the 0.12 output. Run `pnpm docs:check` and `pnpm llms:check`.
- [x] 2.2 `CHANGELOG.md` under `Unreleased`: the new option and the changed default (**breaking** for the log).

## 3. Verify

- [x] 3.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm test:integration`. Do not commit; the owner decides.
