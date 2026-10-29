## 1. Move the plugin

- [x] 1.1 Split `src/core/context-plugin.ts`: the types `NoClash` and `ContextTask` go to `src/core/context-types.ts`; `contextPlugin` goes to `src/context/plugin.ts`, with `src/context/index.ts` only re-exporting it and the two types. `src/effects/plugin.ts` imports `NoClash` from the types file. Move `src/core/context-plugin.test.ts` to `src/context/plugin.test.ts`.
- [x] 1.2 `src/index.ts`: stop exporting `contextPlugin`; keep `NoClash` and `ContextTask` as types. Update the imports of the tests that use the plugin (`src/actions/module-start.test.ts`, `src/scope/plugin.test.ts`, `src/tests/plugin-matrix.test.ts`, `src/tests/types.test.ts`).
- [x] 1.3 Add `src/context/**` to `aboveCore` in `src/tests/architecture.test.ts`; `src/tests/exports.test.ts`: `contextPlugin` leaves the `main` list, and a `context` entry lists it. `integration/bundlers.test.ts` checks that `dist/index.js` has no plugin code and `dist/context.js` has it.

## 2. Entry metadata

- [x] 2.1 `package.json`: `exports["./context"]` (`types`, `import`), and a `size-limit` line `context (plugin)` with a limit from the measured size; `tsdown.config.ts`: entry `context: "src/context/index.ts"`; `tsconfig.json`: path `nanoeffects/context`. `pnpm build`, then check that `dist/index.js` has no `contextPlugin` and that `createBus` in `pnpm size` has not grown.

## 3. Docs, examples, release notes

- [x] 3.1 Change the imports in `docs/context.md`, `docs/typescript.md`, `docs/stores.md`, `docs/plugins.md`, `docs/scope.md`, `docs/oop.md` and `examples/typescript-context/bus.ts`; add the entry to the table of `docs/package.md`, and to `llms.txt` and `skills/nanoeffects/SKILL.md` if they name entries. `pnpm docs:check` and `pnpm llms:check` pass.
- [x] 3.2 `AGENTS.md`: the layout lists `src/context/`, and "Decisions" says the plugin is an entry of its own. `CHANGELOG.md` under `Unreleased`: `### Breaking` with the migration line.

## 4. Verify

- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build && pnpm test:integration && pnpm size`. Do not commit; the owner decides.
