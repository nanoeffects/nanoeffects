# Proposal

## Why

User-facing docs (`README.md`, `docs/`, `examples/`) have a strong voice but no written principles for contributors and assistants. Without them, new pages drift toward package catalogs (Entries tables, full effect lists), internals-first explanations, and TypeScript ceremony that raises the barrier. Docs should be framed by **project level** (who is building what), not by library surface area, so onboarding stays short and each audience gets one first example.

## What Changes

- Add a **Documentation** section to `AGENTS.md` that states: goal; principles; **project levels A–F**; **section gate** (include/exclude); onboarding vs reference; content and example rules; clarity and readiness checks; **non-goal** for business-analyst tooling.
- Add one short constraint to `openspec/config.yaml` `context` pointing at that section (no full copy).
- **Out of scope:** rewriting `README.md` / `docs/` / `examples/` (follow-up); Vale / prose tooling; BA-facing product; new OpenSpec capabilities under `openspec/specs/`; library API changes.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- Code: none under `src/`.
- Docs: `AGENTS.md` gains the principles; one sentence in `openspec/config.yaml`.
- Specs: none (`skip_specs: true`).
- Tests: `pnpm verify` after the edit (no `src` change expected).
