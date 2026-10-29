# Tasks

## 1. The helper and the app

- [x] 1.1 Add `mountEach` (any number of modules as separate arguments; left to right to mount, reverse to undo; skips mounted modules; all or nothing; empty array does nothing) next to `src/actions/module.ts`, and build the public `mount` and `unmount` of the app with it. Update `ModuleApi` and `ModuleHost`. Tests next to it for: one module as before, order of mount, undo in reverse, a module mounted earlier stays mounted, `unmount(a, b)` order, a throwing `setup` rolls back, no module, disposed app, replace by name. Verify with `pnpm vitest run src/actions` and `pnpm tsgo`.
- [x] 1.2 Types in `src/tests/types.test.ts`: one module and several both type-check, a non-module argument is rejected with `@ts-expect-error`. Verify with `pnpm tsgo`.

## 2. devPlugin

- [x] 2.1 Build the wrappers of `devPlugin` with the same helper, so each module of a call with several is logged and `disconnect` puts the originals back. Tests in `src/dev/plugin.test.ts` for the log of several modules, of its returned function, and `disconnect`. Run `src/tests/architecture.test.ts` and `src/tests/plugin-matrix.test.ts`. Verify with `pnpm vitest run src/dev src/tests`.

## 3. Docs, example and size

- [x] 3.1 Add the several-modules form to the modules section of `docs/actions.md` (JS first, a comment on each call, the order in one sentence). Use `app.mount(a, b, c, d)` in `examples/chat/src/app.ts` and update the sentence about the order in `docs/chat-example.md` if it names the four lines. Add the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check`, `pnpm llms:check` and `pnpm tsgo`.
- [x] 3.2 Measure `pnpm build && pnpm size`; raise the limits of `actions` and `dev` in `package.json` only by the measured growth. Verify `pnpm size` passes.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass.
