# Proposal

## Why

Callers often need a one-shot listener (`once`) and a way to wipe every subscription at once (`off()` with no arguments), the way EventEmitter / mitt / Node streams do. Today `bus.off(event)` clears one event, and there is no first-class `once`; both are hand-rolled with `on` + manual `off`.

## What Changes

- Add **`bus.once(event, fn)`**: subscribe like `on`, run on the next matching emit, then unsubscribe. Returns an unsubscribe function (safe to call early or twice).
- Add **`bus.off()`** with no arguments: remove every listener of every event (including `"*"`), like a clear of the whole bus.
- Keep existing `off(event)` / `off(event, fn)` behavior.
- Implement the clear-all path on the internal store; expose `once` on the **bus** (and on `ctx.on`’s sibling only if `once` is part of `On` — prefer bus-level `once` only; task contexts keep `on`/`off` as today unless design says otherwise).
- Docs (guide / errors or a short note), CHANGELOG, size check for `createBus`.

Not **BREAKING** if `off()` was previously a type error / unused overload; it is an additive overload. Confirm TypeScript: calling `off` with zero args must type-check.

## Capabilities

### New Capabilities

- `bus-subscriptions`: one-shot listeners (`once`) and clearing all subscriptions (`off()` with no arguments), including how they interact with duplicate registrations and `"*"`.

### Modified Capabilities

- (none — no existing capability covers bus subscribe/unsubscribe surface)

## Impact

- `src/core/store.ts` — clear-all; optional `once` helper or keep once only in bus
- `src/core/bus.ts` — `once` on `Bus`; `Off` overload with zero args; `ctx.off` inherits the same `Off` type
- Tests: `store.test.ts`, `bus.test.ts`, types in `types.test.ts`
- Docs: Guide and/or short mention; README only if A/B needs it (likely not — link from guide)
- `pnpm size` / CHANGELOG; measure `createBus` growth
