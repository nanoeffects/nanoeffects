# Tasks: emitterPlugin

## 1. Plugin
- [x] 1.1 `src/actions/emitter.ts`: `emitterPlugin`, `EmitterApi<E>`, overloaded `emitter` (free creator first), doc comment with `@example`
- [x] 1.2 Export `emitterPlugin` and `EmitterApi` from `src/actions/index.ts` (re-exports only)

## 2. Tests
- [x] 2.1 Runtime `src/actions/emitter.test.ts`: emits the action; works as a callback (fake store); `prepare` with several arguments; extra argument ignored by a creator without `prepare`; plugin returns the same bus; creator call alone does not emit; bus without the plugin has no `emitter`
- [x] 2.2 Types in `src/tests/types.test.ts`: free creator takes the payload of the event map and rejects a wrong one with `@ts-expect-error`; `createAction<number>` takes a `number`; `prepare` arguments; check that `bus.emit(creator, payload)` is typed for action creators and add an `Emit` overload only if it is not
- [x] 2.3 `src/tests/architecture.test.ts` still passes (`src/actions` imports only core)

## 3. Docs
- [x] 3.1 `docs/stores.md`: one section "Emit from a state manager" with the plugin, `emitter` and a callback line for Nanostores, MobX, Valtio, Jotai (arrow) and Zustand with `subscribeWithSelector`; keep the Redux section; JS first, comment each nanoeffects call
- [x] 3.2 Replace the plain Zustand and MobX recipes in `docs/stores.md` with the new section or link them; no duplicate recipes
- [x] 3.3 `CHANGELOG.md` Unreleased entry; one line in `AGENTS.md` layout/decisions (emitter lives in `src/actions`, bus unchanged)

## 4. Verify
- [x] 4.1 Bundle size of `createBus` unchanged; `pnpm size` for `nanoeffects/actions`
- [x] 4.2 `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build`
- [x] 4.3 `pnpm test:integration` with the real Zustand/MobX if a recipe in `docs/stores.md` is exercised there
