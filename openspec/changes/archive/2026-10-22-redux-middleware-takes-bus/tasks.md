# Tasks

## 1. Check the hook

- [x] 1.1 Read `createTask` in `src/core/context.ts` and `bus.addContext`: confirm that the hook gets a context that already has `type`; if not, find what the origin tracking can use and note it in design.md (decision 2). Check with `src/effects/plugin.ts` how a chained hook keeps the previous one.

## 2. The middleware

- [x] 2.1 `src/store/redux/effects.ts`: `createEffectsMiddleware(bus, options?)` returns the middleware; set `ctx.store` through a chained `bus.addContext`; keep the origin `WeakMap` and the no-self-loop rule; catch the error of `emit` and `report` it; drop `context` from the options and update the doc comment and its `@example`.
- [x] 2.2 `src/store/redux/index.ts`: export the new option type; remove what is no longer used. `src/tests/architecture.test.ts` still passes (the layers).
- [x] 2.3 Tests in `src/store/redux/effects.test.ts`, one per scenario of the spec: actions reach the bus; the same bus works without Redux; `ctx.store` on tasks and absent before install; fields of `effectsPlugin` stay; no self-loop and a longer path is not blocked; `onError` set, `onError` not set (reported with `console.error`), a throwing reducer reaches the caller; `filter` and a thunk.
- [x] 2.4 `src/tests/types.test.ts` and `src/tests/exports.test.ts`: the new call shape and the typed `ctx.store` with `WithContext`; a call with the old shape is a type error.

## 3. Integration, examples and docs

- [x] 3.1 `integration/redux.test.ts`, `integration/bundlers.test.ts` and `scripts/smoke.mjs`: the new call shape; run `pnpm test:integration` and `pnpm smoke` after `pnpm build`.
- [x] 3.2 `examples/redux.ts` and the Redux section of `docs/stores.md` (snippet, the sentence "bus + middleware", the typing block): build the bus first, pass it to `createEffectsMiddleware`, `bus.on(...)` as usual. Check `docs/context.md`, `docs/package.md` and `docs/typescript.md` for the old shape.
- [x] 3.3 `AGENTS.md`: the line on `src/store/redux/` in Layout and the Redux sentence in the decisions. `llms.txt` only if it names the old shape.
- [x] 3.4 `CHANGELOG.md`: a **BREAKING** entry with the migration.

## 4. Final check

- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify` (size limits included); it must pass.
