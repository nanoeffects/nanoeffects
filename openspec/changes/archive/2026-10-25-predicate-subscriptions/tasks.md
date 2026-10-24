# Tasks: predicate-subscriptions

## 1. Types first (gate)
- [x] 1.1 Write the overloads for `on`, `once` and `off` that the plugin adds (a type guard narrows, a boolean predicate does not), and the type that `matchPlugin` returns. Check in `src/tests/types.test.ts` that `bus.on("name", fn)`, an action creator, a free creator and a command are inferred as before on a bus with the plugin, that a guard narrows the payload, and whether `ctx.on(predicate, …)` can be typed without a change to `src/core/bus.ts`. Verify: `pnpm tsgo`. If `ctx.on` cannot be typed, write that in `design.md` (Types) and go on; if the existing inference changes, stop and revise the design

## 2. The plugin
- [x] 2.1 `src/match/plugin.ts`, `src/match/index.ts`: `matchPlugin` wraps `bus.on`, `bus.once`, `bus.off`; a predicate is a function with no string `type`; the subscription rides on `"*"`; the map for `off`; `once` unsubscribes at the first match. Add the entry to `package.json` (`exports`, `size-limit`), `tsdown.config.ts` (main build), `tsconfig.json` and `vitest.config.ts` aliases. Verify: `pnpm build`, `pnpm lint:package`, `pnpm size`, and `createBus` is byte for byte the same as before (measured)
- [x] 2.2 Tests in `src/match/plugin.test.ts`: match and no match, the context and `ctx.type`, order after the listeners of the event, two predicates, a creator and a command keep working, `once` waits for a match, `off` by predicate and by handler, `off()` clears the map, `ctx.on` ends with the task, a policy around the handler, a throwing predicate with and without `onError`, `onUnhandled`, no call after unsubscribe, both orders with `devPlugin`, with and without `disconnect()`. Verify: `pnpm vitest run`
- [x] 2.5 `src/dev/plugin.ts`: count a predicate under `"*"`; make `disconnect` restore `bus.on` only if its wrapper is on top, and otherwise leave the wrapper in place with the counting off. Tests in `src/dev/plugin.test.ts`: a predicate is counted once under `"*"` and the warning names `"*"` in both orders; `disconnect()` in both orders leaves `matchPlugin` working; a plain bus with only `devPlugin` restores `bus.on` exactly as before. Verify: `pnpm vitest run src/dev`, and the existing disconnect tests still pass
- [x] 2.3 Leak test with `WeakRef` (the helpers `settleGarbage` and `aliveCount`): subscriptions removed by the returned function, `off`, `once` after its match and an aborted `ctx.on` leave handlers and predicates collectable. Verify: `pnpm vitest run`
- [x] 2.4 Cost: with `scripts/bench-scope.mjs` or a short script, emit on a bus without the plugin is the same as `HEAD` (separate processes), and the cost of one predicate subscription is written into the design. Verify: the numbers are in `design.md`

## 3. Documentation
- [x] 3.1 `docs/plugins.md`: a row in the table, the order (any order, also with `devPlugin`), "Choose by need". Verify: `pnpm docs:check`
- [x] 3.2 `docs/guide.md`: a section next to "Listen to every event", JavaScript first, with `bus.js`, a domain file and a handlers file as in AGENTS.md, a type guard in the typed part only, and the costs. `docs/package.md`: the row of the new entry. Verify: `pnpm docs:check && pnpm llms:check`
- [x] 3.3 CHANGELOG `Unreleased` and one line in `AGENTS.md` (the plugin, the rule for a predicate, the cost). Verify: reads next to the neighbouring entries

## 4. Verify
- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`. Verify: all green

## Workflow follow-up
- Archive the change with `/opsx:archive`; the version is the owner's choice when the release is prepared.
