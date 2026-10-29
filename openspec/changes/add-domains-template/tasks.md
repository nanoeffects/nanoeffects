# Tasks

## 1. The domains

- [x] 1.1 Create `packages/create-nanoeffects/templates/domains-ts/` with `_gitignore`, `package.json` (from `react-ts`), `tsconfig.json`, `index.html` (for `main.tsx`), `vite.config.ts` and `src/api.ts` (a fake server: product search with a delay that honors the signal, and an order that fails on its first call). Verify the file list against `react-ts`.
- [x] 1.2 Add the `catalog` domain: `catalog.ts` (`createAction<Product[]>` for the result, a command for the query), `catalog-handlers.ts`, `catalog-module.ts` (`createModule` with `debounce` and `latest`). Events file imports no bus; every nanoeffects call has a comment. Verify with `pnpm templates:check`.
- [x] 1.3 Add the `checkout` domain: `checkout.ts` (`createJob` with `pending`, `success`, `fail`, `cancel`), `checkout-handlers.ts` (`leading` and `retry`), `checkout-store.ts` (plain store with `get` and `subscribe`), `checkout-module.ts` (updates the store from the four outcomes). Verify with `pnpm templates:check` and that a second start while running sends no extra `pending`.

## 2. The thin UI

- [x] 2.1 Add `src/bus.ts` (bus and `reactPlugin`, no events), `src/app.ts` (`modulePlugin` with both modules), `src/main.tsx`, and `src/ui/` (`App.tsx`, `ProductsProvider.tsx` with one `useEventState` and the not-a-store comment, `SearchBox.tsx`, `Products.tsx`, `CheckoutButton.tsx` reading the store with `useSyncExternalStore`). Components call commands or emit; none imports `api.ts`. Verify with `pnpm templates:check` and a wrong payload that the check fails.

## 3. The command and its tests

- [x] 3.1 Add `domains-ts` to `templates` in `packages/create-nanoeffects/index.js` (default stays `vanilla`). Update `index.test.js`: five names, the question lists them, `--template domains-ts` copies the files, the unknown-template message names all five, and the layout test for `domains-ts` (each domain folder has events, handlers and module; `bus.ts` imports no events; events files import no bus). Verify with `pnpm vitest run packages/create-nanoeffects`.

## 4. Docs

- [x] 4.1 Update `docs/starter.md` (a row in the templates table, the layout of `src/domains/`, when to pick it) and add a link to the template from `docs/actions.md` next to the modules recipe. Add the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 5. Integration

- [x] 5.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Then pack, scaffold `domains-ts` into a scratch directory, run `npm install` and `npm run build`, and confirm the fake order fails once and then succeeds. Verify all pass.
