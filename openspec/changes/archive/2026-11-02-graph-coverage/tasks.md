## 1. mergeGraphs

- [x] 1.1 Add `src/graph/merge.ts`: join nodes (sum counts, first `site`, last `last`), edges (sum counts, OR `inCycle`), cycles (dedupe by kind, source and ring; sum `turns`, max `repeats`), `name` from the first snapshot that has one. Do not change the inputs.
- [x] 1.2 Test in `src/graph/merge.test.ts`: counts, union, same ring found from another node, inputs unchanged, no argument, JSON round trip, merge of `toJSON()` of two real `graphLogger` runs.

## 2. findOrphans

- [x] 2.1 Add `src/graph/orphans.ts`: `Orphan` type and `findOrphans(described, snapshot)` with kinds `unemitted` and `unrun`; skip `"<anonymous>"`.
- [x] 2.2 Test in `src/graph/orphans.test.ts`: unrun, unemitted, anonymous left out, all ran, merged coverage, and one test with a real bus (`tracePlugin`, `describeBus`, `graphLogger`) that names listeners by `traceId` and by function name and checks that the names match the nodes.

## 3. Surface

- [x] 3.1 Re-export from `src/graph/index.ts` and `src/trace/index.ts`; update `src/tests/exports.test.ts` and `src/tests/surface.test.ts`.
- [x] 3.2 Run `pnpm size`; adjust the `trace` limit only if needed and say why in the commit.

## 4. Docs

- [x] 4.1 Add the recipe "Build the graph from your tests and look for dead listeners" to `docs/debugging-loops.md` (or `docs/tracing.md`): `toJSON()` in `afterAll`, one file per run, `mergeGraphs`, `describeBus` without `source`, `findOrphans`; JS first, comments on every nanoeffects call, files named by job; level and next step at the top; `docs:check` passes.
- [x] 4.2 Mirror it in `docs/ru/` (read `RUSSIAN-DOCS.md` first); keep the code identical except comments.
- [x] 4.3 Add the two entries to the `graphLogger` / `describeBus` rows of the tables in `docs/tracing.md` and `docs/package.md`; check `llms.txt` (no new page, so no new link).
- [x] 4.4 `CHANGELOG.md` under `Unreleased`, `### Added`, two short bullets with a docs link.

## 5. Verify

- [x] 5.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`.
