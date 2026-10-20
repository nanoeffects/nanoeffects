# Tasks

## 1. Store: clear all keys

- [x] 1.1 Add clear-all on `createStore` (e.g. `remove()` / `clear()` with no key): drop every entry in `events` and invalidate `lists`. Verify: unit tests in `store.test.ts` that two keys plus `"*"` are empty after clear, and that a mid-emit walk of a previously obtained list is undisturbed.
- [x] 1.2 Keep `remove(key)` and `remove(key, task)` behavior unchanged. Verify: existing `store.test.ts` cases still pass.

## 2. Bus: `off()` and `once`

- [x] 2.1 Extend `Off` with a zero-arg overload; implement `bus.off()` → store clear-all; keep `off(event)` / `off(event, fn)`. Verify: `bus.test.ts` covers clear-all (named events + `"*"`), and existing per-event / per-handler off tests still pass.
- [x] 2.2 Add `bus.once(event, fn)` on `Bus` (same event shapes as `on`): register via `on`, unsubscribe before invoking `fn` on first delivery; return unsubscribe. Verify: `bus.test.ts` covers once, early off, double unsubscribe, and once + `on` ordered emit (both run on first emit; only `on` on second).
- [x] 2.3 Type tests: `bus.off()` and `bus.once(...)` type-check; wrong `once` payload fails with `@ts-expect-error` where appropriate. Verify: `src/tests/types.test.ts` and `pnpm tsgo` clean.

## 3. Docs, changelog, size

- [x] 3.1 Document `once` and `off()` in the Guide (and a short note that `ctx.off()` is the same `Off`, including clear-all). Do not add a third README demo. Verify: links resolve; snippets match tests.
- [x] 3.2 CHANGELOG entry for the next version. Verify: wording matches the public API.
- [x] 3.3 `pnpm size` for `createBus`; if over 1.3 kB, tighten before raising the limit. Verify: `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build && pnpm size` (or full `pnpm verify`) passes.

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
