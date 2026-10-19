# Tasks

## 1. Standalone recipes

- [ ] 1.1 Rewrite `examples/search.ts` to debounce + latest + `api.search` + emit `results` only (no retry/timeout/`onUnhandled`) and verify `pnpm tsgo` type-checks it
- [ ] 1.2 Rewrite `examples/modules.ts` to one module with contract `handle`, `use` of a command-with-handler, and `m.on` (no job/spawn/second module) and verify `pnpm tsgo` type-checks it
- [ ] 1.3 Simplify `examples/redux.ts` to one straight `latest` handler (no early-return cache) and verify `pnpm tsgo` type-checks it

## 2. Docs alignment

- [ ] 2.1 Update `docs/actions.md` / `docs/stores.md` (and any other doc that mirrors these files) only where a snippet would diverge from the new recipes; leave `docs/guide.md` alone unless a factual mismatch appears; verify links to `examples/` still resolve

## 3. Guide and verify

- [ ] 3.1 Leave `examples/guide.ts` unchanged unless a shared name would lie; if touched, verify `pnpm vitest run src/tests/guide.test.ts` passes
- [ ] 3.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build` and confirm it passes (no CHANGELOG for this docs-only change)

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
