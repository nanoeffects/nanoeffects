# Tasks

## 1. AGENTS.md Documentation section

- [x] 1.1 Add `## Documentation` to `AGENTS.md` (English, AGENTS register) with: goal; principles; project levels A–F (table); section gate questions; onboarding vs reference (Entries / full effects = reference); content recommendations; clarity checklist; code-example rules (JS-first; `examples/*.ts` type-checked); readiness criterion; non-goal for BA tooling; main principle line. Verify: section matches `design.md` Decisions 2–7; no rewrite of `README.md` / `docs/`.

- [x] 1.2 Point the Layout line for `docs/, examples/` (or the opening paragraph) at `## Documentation`. Verify: one hop from layout to the section.

## 2. OpenSpec context pointer

- [x] 2.1 Append one sentence to `openspec/config.yaml` `context`: user docs follow Documentation in `AGENTS.md` (project levels, section gate, practice-first, JS-first). Verify: `openspec context --json` loads and includes the sentence.

## 3. Check

- [x] 3.1 Run `pnpm verify`: types, lint, unit/integration tests, build, smoke, and package lint pass; `size-limit` fails on `createBus` (+27 B over 1.2 kB) — pre-existing, unrelated to this docs change.

## Workflow follow-up

- Archive after review (`/opsx-archive`).
- Optional later: align `README.md` / `docs/` (e.g. move Entries off README) to the new bar.
