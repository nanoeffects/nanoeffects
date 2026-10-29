# Tasks

## 1. The TypeScript templates

- [x] 1.1 Create `packages/create-nanoeffects/templates/vanilla-ts/` as the typed twin of `vanilla` (`_gitignore`, `index.html` for `main.ts`, `package.json` with `typescript` and `build` = `tsc --noEmit && vite build`, `tsconfig.json`, `src/main.ts`, `bus.ts`, `search.ts` with `createAction<Payload>`, `search-handlers.ts`, `api.ts`), keeping the comments on every nanoeffects call. Verify the files exist and `tsc --noEmit` passes through the check of task 2.1.
- [x] 1.2 Create `templates/react-ts/` as the typed twin of `react` (adds `vite.config.ts`, `tsconfig.json` with `jsx: react-jsx`, `@types/react` and `@types/react-dom`, `main.tsx`, `App.tsx` with `useEventState(searchLoaded, [])` typed from the event, `Notes.tsx`). Verify with the check of task 2.1.

## 2. The check and the command

- [x] 2.1 Add `scripts/templates-check.mjs`: for each `*-ts` template write a temporary `tsconfig` that extends the template's and the `nanoeffects/*` `paths` of the root `tsconfig.json`, run `tsc`, and fail with the template file name. Add it to `pnpm verify` as `pnpm templates:check`. Verify it passes, and that a deliberately wrong payload in a template makes it fail.
- [x] 2.2 Add the two names to `templates` in `packages/create-nanoeffects/index.js` (default stays `vanilla`). Update `packages/create-nanoeffects/index.test.js`: the list has four names, the question lists them, `--template react-ts` copies the files with a `.gitignore`, each TS template has the base names of its JS twin, and the unknown-template message names all four. Verify with `pnpm vitest run packages/create-nanoeffects`.

## 3. Docs

- [x] 3.1 Update `docs/starter.md`: two rows in the templates table, when to pick TypeScript, `.ts` names in the files table, an example `--template react-ts`. Add the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Update `llms.txt` only if the starter line names the templates. Verify with `pnpm docs:check` and `pnpm llms:check`.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass. Before a release, run `pnpm consumer-check` against the packed tarball and start `react-ts` from a scratch copy (`npm install && npm run build`).
