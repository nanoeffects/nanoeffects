# Design

## Context

See proposal.md for motivation. Today `examples/` has four files:

| File | Role today |
| --- | --- |
| `guide.ts` | Twin of `docs/guide.md`; executed by `src/tests/guide.test.ts` |
| `search.ts` | Debounced search with `latest`, nested `retry(timeout(...))`, `onUnhandled` |
| `modules.ts` | Contract command, job, command-with-handler, `spawn`, second module via `mount` |
| `redux.ts` | Middleware + `latest` + store early-return |

`docs/actions.md` and `docs/stores.md` already show shorter snippets; the example files should match that density, not outdo the guide.

## Goals / Non-Goals

**Goals:**

- One idea per standalone example file, readable in a glance.
- Keep type-checking (`pnpm tsgo`) and the guide test green.
- Prefer deleting a side feature from an example over explaining it in a comment.

**Non-Goals:**

- Changing public API, packages, or runtime behavior.
- Rewriting `docs/guide.md` / `examples/guide.ts` as a whole.
- Adding new example files or splitting into many tiny files.
- Teaching every API surface in `examples/` (that stays in `docs/`).

## Decisions

1. **`search.ts` = debounce + latest only.** Keep typed events, `api.search` with `signal`, emit `results`. Drop `retry`/`timeout` nesting, the named `searchTask` wrapper, and `onUnhandled`. Nested effects belong in the guide and `docs/effects.md`.

2. **`modules.ts` = one module, two command shapes.** Keep a contract (`createCommand` + `m.handle`), a command that carries its handler (`m.use`), one `m.on`, `modulePlugin`, and one `bus.emit(command, …)`. Drop `createJob`, `m.spawn`, and the second “audit” module. Jobs stay documented in `docs/actions.md`.

3. **`redux.ts` = middleware + one handler.** Keep `WithContext` / `store`, `latest`, fetch with `signal`, `dispatch`. Drop the “already loaded” early return so the handler is one straight path.

4. **`guide.ts` stays the long form.** Touch it only if a shared name or import would otherwise lie; do not thin its steps to match the recipes.

5. **Docs follow the recipes, not the reverse.** Update a doc snippet only when it currently mirrors a file we simplify and would otherwise diverge. No new docs page for “examples”.

## Risks / Trade-offs

- [Jobs / nested effects vanish from `examples/`] → They remain in `docs/actions.md` and `docs/effects.md` / the guide; recipes stop duplicating them.
- [Readers lose the “full app” feel of `modules.ts`] → Intentional: one domain module is enough to show `handle` / `use` / `on` / `modulePlugin`.

## Migration Plan

None: documentation and type-checked examples only. Rollback is reverting the files.
