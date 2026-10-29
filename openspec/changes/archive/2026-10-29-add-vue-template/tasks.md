# Tasks

## 1. Spike and check

- [x] 1.1 Add `vue`, `vue-tsc` and a `typescript-5` alias as dev dependencies, with `scripts/vue-tsc.mjs` that runs `vue-tsc` with TypeScript 5 (the TypeScript 7 of the repository fails: no `typescript/lib/tsc`), and use `typescript@^5.9` for `vue-ts` only. Verify by a passing and a failing `.vue` file.
- [x] 1.2 Make `scripts/templates-check.mjs` use `vue-tsc` for a template that has a `.vue` file (same temporary `tsconfig`, same filter on the template's files). Verify that the other three templates still pass and that a wrong payload in a `.vue` file fails the check.

## 2. The template

- [x] 2.1 Create `packages/create-nanoeffects/templates/vue-ts/` with `_gitignore`, `index.html`, `package.json` (`vue`, `@vitejs/plugin-vue`, `vue-tsc`, `typescript`, `vite`, `build` = `vue-tsc --noEmit && vite build`), `tsconfig.json`, `vite.config.ts` and `src/env.d.ts`. Verify the file list against `react-ts`.
- [x] 2.2 Add the files of the app: `bus.ts`, `search.ts` (`createAction<Payload>`), `search-handlers.ts`, `api.ts`, `use-event-ref.ts` (with the not-a-store comment), `main.ts`, `App.vue` (emits from `@input`, reads the result with `useEventRef`) and `Notes.vue` (`withPolicy` and `onScopeDispose`). Every nanoeffects call has a comment. Verify with `pnpm templates:check` and by a wrong payload that the check fails.

## 3. The command and its tests

- [x] 3.1 Add `vue-ts` to `templates` in `packages/create-nanoeffects/index.js` (default stays `vanilla`). Update `index.test.js`: six names, the question lists them, `--template vue-ts` copies the files, the unknown-template message names all six, and `vue-ts` has the files of `react-ts` with `App.tsx` as `App.vue` and `main.tsx` as `main.ts`. Verify with `pnpm vitest run packages/create-nanoeffects`.

## 4. Docs

- [x] 4.1 Update `docs/starter.md` (a row in the templates table and one sentence on when to pick it) and the starter line of `llms.txt`. Add the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 5. Integration

- [x] 5.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Then pack, scaffold `vue-ts` into a scratch directory, run `npm install` and `npm run build`, and check in a browser that typing sends one request and an unmount removes the listener. Verify all pass.
