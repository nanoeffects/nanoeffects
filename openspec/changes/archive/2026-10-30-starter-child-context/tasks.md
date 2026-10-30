# Tasks

## 1. Runtime

- [x] 1.1 In `src/effects/run.ts` pass `child.ctx` to the starter instead of `{ signal, abort }`; keep `EffectContext` as the type for the bare case. Do the same in `src/effects/timeout.ts`. Tests next to them: `take` on the child, the loser's `take` is aborted, no listener is left, the caller is not aborted.
- [x] 1.2 Test with `{}` and `{ signal }` as the first argument: a starter gets `signal` and `abort`, `delay(child, …)` works.
- [x] 1.3 Core: keep `addContext` on the context and pass it in `forkTask` (found while testing: a fork skipped the hook). `effectsPlugin`: remember the functions it binds and bind them again to a context that already holds its own function for the key. Test: bound `delay` and `take` on the child are bound to the child; cancelling one starter does not abort the caller's own bound effects; a value that is not the plugin's stays.
- [x] 1.4 `scopePlugin`: in `addContext`, adopt the inherited layers and module scope for a context made by `forkTask`. Test with a scope (fields and `$effects`) and a race inside the handler, for a command and for a module. Add a probe to `src/tests/plugin-matrix.test.ts` (any order with `effectsPlugin`).
- [x] 1.5 Trace test: a listener made through the child has the `run` task of the starter as its parent.

## 2. Types

- [x] 2.1 Type the starter argument by the first argument (`ChildOf<C>`) in `race`, `all`, `allSettled`, `timeout` (both forms of each). Cases in `src/tests/types.test.ts`: task context, `{}`, `{ signal }`, `@ts-expect-error` for `take(child, …)` on the bare case.
- [x] 2.2 Type the starters of the bound forms in `src/effects/plugin.ts` with the child context and the bound effects; resolve the open point of `design.md`.

## 3. Docs, examples, changelog

- [x] 3.1 `docs/effects.md`: replace the paragraph and the `race` example (`(child) => …` and the bound form), the `timeout` + `take` example, `options.signal` bullet. `docs/migrating-from-rxjs.md` the same. Keep `docs/plugins.md` consistent. Run `pnpm docs:check` and `pnpm llms:check`.
- [x] 3.2 `examples/counter` (plain and redux handlers) and `README.md` of the example use `(child) => delay(child, 1000)` and `(child) => take(child, incrementCancelled)`.
- [x] 3.3 `CHANGELOG.md` under `Unreleased` / `Changed`: starters get the child context; the old form works.

## 4. Check

- [x] 4.0 `scripts/bench-scope.mjs` before and after: the cost of a fork.
- [x] 4.1 Bundle `createBus` alone with rolldown and compare brotli before and after; `pnpm size`.
- [x] 4.2 `pnpm verify`.
