# Tasks

## 1. The check

- [x] 1.1 Keep `tools/svelte-check` (private workspace package with `svelte`, `svelte-check` and `typescript@5`) and add `tools/*` to `pnpm-workspace.yaml`. Make `scripts/templates-check.mjs` run its `svelte-check` for a template that has a `.svelte` file, with the same temporary `tsconfig` and the same filter. Verify that the other templates still pass and that a wrong value in a `.svelte` file fails with its name.

## 2. The template

- [x] 2.1 Create `packages/create-nanoeffects/templates/svelte-ts/` with `_gitignore`, `index.html`, `package.json`, `svelte.config.js`, `tsconfig.json`, `vite.config.ts` and `src/` (`main.ts`, `App.svelte`, `Notes.svelte`, `bus.ts`, `search.ts`, `search-handlers.ts`, `api.ts` with `WithSignal`, `event-store.ts` with the not-a-store comment). Every nanoeffects call has a comment. Verify with `pnpm templates:check` and by a wrong payload that the check fails.
- [x] 2.2 Add `svelte-ts` to `templates` in `packages/create-nanoeffects/index.js` and update `index.test.js` (seven names, `--template svelte-ts`, the files of `react-ts` with `.svelte` for the components, no emit on mount in the source). Verify with `pnpm vitest run packages/create-nanoeffects`.

## 3. Docs

- [x] 3.1 Update `docs/starter.md` (a row and a paragraph), the starter line of `llms.txt` and `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Pack the package, make `svelte-ts` into a scratch directory, install and build it, and open it in a browser: typing sends one request and the result appears. Verify all pass.
