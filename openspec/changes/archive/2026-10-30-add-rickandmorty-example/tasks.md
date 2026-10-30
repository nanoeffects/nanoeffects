# Tasks

## 1. The project

- [x] 1.1 Make `@tanstack/react-query` a dev dependency of the repository and remove its stub from `scripts/docs-stubs.d.ts`. Verify with `pnpm docs:check` and `pnpm tsgo`.
- [x] 1.2 Create `examples/rickandmorty/` with `package.json`, `tsconfig.json`, `index.html`, `README.md`, `src/bus.ts`, `src/api.ts`, `src/characters.ts`, `src/App.tsx` and `src/main.tsx`. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.3 Check against the real API in a browser: the list loads, a search and a status filter change it, "Load more" adds a page, a name with no match shows an empty result, a character opens its episodes. Verify in the browser.

## 2. Index and integration

- [x] 2.1 Add the row to `examples/README.md`, the line to `CHANGELOG.md` under `Unreleased` (`### Added`), and a link from `docs/query-libraries.md`. Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 2.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`. Verify all pass.
