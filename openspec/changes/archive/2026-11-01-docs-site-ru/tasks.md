## 1. Review of the English docs as a newcomer

- [x] 1.1 Create `review.md` in the change folder with the newcomer checklist and the glossary; record the first findings on `README.md` (names `analytics` and `api` that the first snippets do not define, install details) and fix them. Test: `pnpm docs:check` and `pnpm llms:check` pass.
- [x] 1.2 Rewrite `docs/README.md` as the map of levels A to F (kind of project, where to stop, first page, prerequisites), keep the jump table and the reference list after it. Test: `pnpm docs:check` passes; every level has a first page that exists.
- [x] 1.3 Add `docs/recipes.md` (index by problem, simple to complex, links only), add it to `llms.txt` and to the English sidebar. Test: `pnpm llms:check` and the sidebar test pass; every recipe page is linked from it.
- [x] 1.3a Add a short heading per policy to `docs/policies.md` and per effect to `docs/effects.md` (table first, then one `###` each: one line, signature, link to the full section), and add them to the `## On this page` lists. Test: `pnpm docs:check` passes; every anchor exists.
- [x] 1.3b Regroup the English sidebar by the groups in design.md (frameworks together, libraries and stores together, collapsible groups, current group open) with nested policy and effect links. Extend `docs-site.test.ts` to check that each nested link points at an existing heading. Test: the sidebar test passes and fails on a made-up anchor; the site build passes.
- [x] 1.4 Review and fix level A and B pages: `guide`, `motivation`, `starter`, `package`, `policies`, `cancel-stale-requests`, `debounce-and-abort`, `prevent-double-submit`. Put the level and the prerequisite at the top of each, and a next step at the end. Record findings in `review.md`. Test: `pnpm docs:check` passes.
- [x] 1.5 Review and fix level C and D pages: `effects`, `errors`, `actions`, `context`, `scope`, `server`, `react`, `vue`, `svelte`, `chat-example`, `chat-widget`, `oop`. Same rules. Test: `pnpm docs:check` passes.
- [x] 1.6 Review and fix level E and F pages and the rest: `stores`, `query-libraries`, `typescript`, the four `migrating-from-*` pages, `semantics`, `tracing`, `observable`, `hmr`, `plugins`, `stability`. A finding that needs an API change is recorded as left. Test: `pnpm docs:check` and `pnpm llms:check` pass.
- [x] 1.7 Stop and show `review.md` to the owner; apply what the owner changes. Test: `pnpm docs:check` passes.

## 2. Checks and site support for the Russian pages

- [x] 2.1 Extend `scripts/docs-check.mjs` to `docs/ru/`: type-check its blocks, report a missing or extra page, and the parity of blocks (same count and language, same code once comments are removed). Test: unit tests with a temporary docs folder for each scenario of `docs-ru` (missing page, extra page, changed line, translated comment, stale name).
- [x] 2.2 Add the `ru` locale to the site config and a Russian sidebar (`sidebar.ru.ts`); extend `docs-site.test.ts` to both sidebars. Test: the test fails on a missing or unknown page in either locale; the site build passes with a stub `docs/ru/README.md`.

## 3. Translation (starts per level after its review is done)

- [x] 3.1 Translate `README.md` of docs, `recipes`, and the level A and B pages into `docs/ru/`. Test: `pnpm docs:check` (types and parity) passes; the owner reads these pages.
- [x] 3.2 Translate level C and D pages. Test: `pnpm docs:check` passes.
- [x] 3.3 Translate level E, F and the remaining pages so all 35 exist. Test: `pnpm docs:check` passes with no missing page.
- [x] 3.4 Add the Russian sidebar entries and check links: out-of-docs links resolve to GitHub, in-docs links to `/ru/`. Test: the site build passes with dead links on.

## 4. Wrap-up

- [x] 4.1 Add to AGENTS.md: the rule that a change to a page edits `docs/ru/<page>.md` too, `docs/ru/` and `docs/recipes.md` in the Layout, and the newcomer checklist in the Documentation section. Link the Russian site from `docs/ru/README.md` and the README (one line). Test: n/a, wording.
- [x] 4.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm docs:site && pnpm build` and `pnpm lint:package` for the larger package. Test: all pass; commit and push only after the owner says so.
