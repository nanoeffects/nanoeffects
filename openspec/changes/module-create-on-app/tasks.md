# Tasks: createModule on the app

## 1. Plugin
- [x] 1.1 Add `createModule` to `ModuleApi<E>` with a doc comment and `@example`; return it from `modulePlugin` (the existing `createModule` bound to `E`)
- [x] 1.2 Confirm `src/core` is untouched and `pnpm size` does not change for the `createBus` entry

## 2. Tests
- [x] 2.1 `src/actions/module-plugin.test.ts` (names without abbreviations): name and setup kept, setup not run on creation, mounted by `app.mount`, the same module mounted on a second app, existing `createModule` unchanged
- [x] 2.2 Types in `src/tests/types.test.ts`: `ctx` has the `WithContext` field and the `effectsPlugin` field, a missing field is `@ts-expect-error`, `m.handle(command, (id, ctx) => …)` infers payload and result

## 3. Docs and example
- [x] 3.1 `examples/typescript-context`: `app` in `bus.ts` (`bus.use(modulePlugin())`), `app.createModule` in `user.ts`, `app.mount` in `main.ts`; drop `AppEvents` from `user.ts`
- [x] 3.2 `docs/typescript.md`: use `app.createModule`, say when `createModule` of the library is still right, note the order of files (design, 3)
- [x] 3.3 `docs/actions.md`: one sentence and one line in the modules example
- [x] 3.4 `CHANGELOG.md` Unreleased

## 4. Finish
- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm vitest run && pnpm build`
