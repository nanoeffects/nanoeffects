# Proposal

## Why

The standalone files under `examples/` pack too much into each scene: nested effects, several command shapes, jobs, spawn, and hot-mounting sit next to the one idea a reader came for. They should read as short recipes, not as a second guide. The typed walkthrough stays in `examples/guide.ts` with `docs/guide.md`.

## What Changes

- Rewrite `examples/search.ts`, `examples/modules.ts`, and `examples/redux.ts` so each file shows one clear recipe with less nesting and fewer side features.
- Keep `examples/guide.ts` as the step-by-step twin of `docs/guide.md` (and of `src/tests/guide.test.ts`); only touch it if a line must stay honest with the simpler recipes or with the docs.
- Align short snippets in `docs/` (especially `actions.md`, `stores.md`, and any link that points at these examples) when the recipe shape changes, without rewriting the guide itself.
- No runtime API change, no new entry, no CHANGELOG entry for behavior.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- Code: none under `src/` (examples and docs only; `examples/` stay type-checked via tsconfig paths).
- Tests: `src/tests/guide.test.ts` must keep passing if `guide.ts` is touched; otherwise examples are type-checked by `pnpm tsgo`.
- Docs: `docs/actions.md`, `docs/stores.md`, and any other page that mirrors these recipes; `README.md` only if it embeds a snippet that diverges.
- Specs: none (`skip_specs: true`); library behavior is unchanged.
