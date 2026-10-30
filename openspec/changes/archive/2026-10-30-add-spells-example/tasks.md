# Tasks

## 1. The project

- [x] 1.1 Create `examples/spells/` with `package.json`, `tsconfig.json` (with `paths` to `src`), `index.html`, `README.md`, `src/bus.ts`, `src/spells.ts` (the type, the client with `WithSignal`, the command), `src/App.tsx` and `src/main.tsx`. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.2 Check against the real PotterAPI in a browser from a scratch install: the list loads, fast typing sends one request, a newer search cancels the older one, and the loading flag stays on while a newer request runs. Verify in the browser and with `vite build`.

## 2. Index and integration

- [x] 2.1 Add the row to `examples/README.md` and the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 2.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass.
