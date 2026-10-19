# Tasks

## 1. use

- [ ] 1.1 `use` on the bus returned by `createBus` and its type in `Bus`. Verify: unit tests that the plugin gets the bus, its result is returned, an error comes out, and plugins run in the order they are used.
- [ ] 1.2 Type tests: `use` returns the type that the plugin returns, and a wrong plugin (not a function of the bus) does not compile. Verify: `pnpm tsgo` clean.

## 2. The module plugin

- [ ] 2.1 `modulePlugin(modules?)` in `src/actions/module.ts`, with the body of `registerModules`; remove `registerModules` and update `src/actions/index.ts` and the doc comments. Verify: `pnpm tsgo` clean.
- [ ] 2.2 Move every call site to `bus.use(modulePlugin(...))`: `src/actions/register-modules.test.ts` (rename the file to `module-plugin.test.ts`), `src/tests/test-helpers.ts`, `src/tests/exports.test.ts`, `src/tests/types.test.ts`, `src/tests/context-option.test.ts`, `integration/bundlers.test.ts`, `examples/guide.ts`, `examples/modules.ts`. Verify: `pnpm vitest run` and `pnpm test:integration` pass.
- [ ] 2.3 Tests of the plugin: modules mounted at once in order, the returned api, no modules given, replacement by name, the registry used or attached. Verify: the new tests pass.

## 3. Docs

- [ ] 3.1 `docs/guide.md`, `docs/actions.md`, `docs/hmr.md`, `README.md` show `bus.use(modulePlugin(...))`. Verify: `pnpm tsgo` type-checks the examples and `src/tests/guide.test.ts` passes.
- [ ] 3.2 `AGENTS.md` (the rule on plugins, the layout, the commands decision) and `CHANGELOG.md`. Verify: they match the docs.

## 4. Verification

- [ ] 4.1 `pnpm verify` passes; `createBus` stays within its size limit. Verify: the command exits 0 and `pnpm size` passes.

## Workflow follow-up

- After apply: `openspec archive bus-use-plugins`, then apply `dev-diagnostics`, which builds on `bus.use`.
