# Design

## Context

See proposal.md for motivation. Today `createStore` supports `remove(key)` (clear one event) and `remove(key, task)` (one registration). `bus.off` forwards to that. There is no clear-all and no `once`. `createStore` is not a public package entry; the public surface is the bus (and `ctx.off`, typed as the same `Off`).

`createBus` size stays a hard constraint (~1.3 kB brotli): prefer a few lines over a new abstraction.

## Goals / Non-Goals

**Goals:**

- Public `bus.once` matching `on`’s event argument shapes.
- Public `bus.off()` with zero args clears the whole subscription table.
- Store supports clear-all so `off()` stays a thin forward.
- Emit-safe: self-unsub / clear during emit does not corrupt the walk (reuse list cache semantics).

**Non-Goals:**

- Exporting `createStore` / `once` on the store as a public API.
- `ctx.once` (task-scoped once); callers use `bus.once` or `on` + manual `off`.
- Changing `off(event)` / `off(event, fn)` semantics.
- A separate `clear()` name on the bus (overload `off()` instead).

## Decisions

**1. `once` lives on the bus, not as a public store API.**  
Store stays internal. Implement `once` as a thin wrapper: register via `on`, unsubscribe on first delivery (unsubscribe before invoking `fn`, so a nested `emit` of the same event does not re-enter the once handler). Alternative: `store.once` — rejected; store is not exported and would duplicate the event-key / creator logic already in `on`.

**2. Clear-all is `store` responsibility; bus `off()` with no args calls it.**  
Add something like `remove()` / `clear()` on the store that drops every key in `events` and invalidates `lists`. `bus.off` becomes: no args → clear-all; else → existing `remove(eventKey(event), fn)`. Alternative: loop `Object.keys` in bus only — rejected; store owns the maps and the emit-safety cache.

**3. `Off` gains a zero-arg overload; `ctx.off` inherits it.**  
`Context.off` is already `Off<E>` (“same as the bus `off`”). So `ctx.off()` clears the whole bus. Document that. Alternative: a narrower `TaskOff` without zero-arg — rejected for this change to avoid two `off` types; revisit only if it proves dangerous in practice.

**4. `once` shares `On`-compatible overloads for the event argument.**  
Same first-argument shapes as `on` (string, `{ type }`, free/typed action creator, command). Payload typing of `fn` follows `on`. Keep the implementation one path through `eventKey` + `on`, not a parallel overload matrix if inference allows a single implementation plus typed façade.

**5. Size.**  
Expect a small brotli bump (clear-all loop + once wrapper). Measure with `pnpm size`; if over 1.3 kB, prefer shortening strings / sharing the unsubscribe helper before raising the limit again.

## Risks / Trade-offs

- [`ctx.off()` clears the entire bus`] → Document; same as calling `bus.off()`. Mitigation: examples use `off(event)` / returned unsubscribe from `on`/`once`.
- [`once` + async `fn`] → Unsubscribe happens on the synchronous entry to the handler (before `fn` returns / awaits). A second emit while the first `fn` is still awaiting does not re-invoke that once registration. Document if needed.
- [`createBus` size`] → Measure; keep clear-all and once minimal.

## Migration Plan

Additive API. No migration for existing `off(event)` callers. Changelog under the next version: `once`, `off()` clear-all. Docs: Guide (short) + keep README free of a third overlapping demo unless desired later.

## Open Questions

None that block specs or tasks: public surface is bus `once` + `off()`; store gets clear-all only.
