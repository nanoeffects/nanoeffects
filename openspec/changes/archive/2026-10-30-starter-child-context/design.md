# Design

## Context

`startStarters` (`src/effects/run.ts`) already forks a full child with `forkTask(group)`, which copies `emit`, `on`, `off` and the bus fields and calls `bus.addContext`, then hands the starter only `{ signal, abort }`. `timeout` does the same with its own child. So the runtime child is almost the finished product: this change mostly widens the type and passes the child on. `take` needs `ctx.on`; the other effects need `signal`.

## Goals / Non-Goals

**Goals:**
- One context per starter: `(child) => effect(child, …)` for every effect, including `take`.
- The bound form (`({ delay, take }) => …`) with no extra wiring.
- No growth of `createBus`.

**Non-Goals:**
- No change of the ctx-first rule of effects, no curried or lazy effects (`delay(1000)` as a starter): not now.
- No new option of `createBus`, no hook in core.

## Decisions

**Pass `child.ctx` as it is, and rebind what the parent had.** `forkTask` makes the child from the fields of its parent, so a function that a plugin bound to the parent (`ctx.delay`, an entry of `$effects`) is copied to the child still bound to the parent: cancelling the child would not stop it. `forkTask` also skipped `bus.addContext` for the child, so no plugin saw it. The one core change: `createTask` keeps its `addContext` on the context under a symbol key (inherited by a fork, as the other fields are), and `forkTask` passes it on, so a fork goes through the same hook as any task. Then the plugins that bound the function take it back in the `addContext` they already have:

- `effectsPlugin` remembers each function it binds (a module-level `WeakMap` from the bound function to the effect). When a context already has the key and the function is one of its own, it binds the effect again to this context; any other value (a scope's, a user's) stays. Order with `scopePlugin` does not matter: the scope's function is not in the map.
- `scopePlugin` already keeps the layers and the module scope on the context (`callKey`, `moduleKey`) and `adopt` binds them to a task for `ctx.run`. A context made by `forkTask` has these keys from its parent, so `addContext` calls `adopt` for it with them. An emit that is pending for the same type and payload is matched first, with the module scope the context already has.

**Type the argument by the first argument.** `race<C extends { signal?: AbortSignal }>(ctx: C, effects: …)` with `ChildOf<C> = C extends Context<infer E> ? Context<E> : EffectContext`. A task context gives `Context<E>` (so `take(child, "ev")` is checked against the event map); `{}` or `{ signal }` gives `{ signal, abort }`. The runtime does not tell the two apart by type: a parent without `on` makes a child without `on`, which is what the type says.

**Bound forms.** `Bound<E>["race"]` and the others type their starters with `Context<E> & BoundOf<H, E>`: `BoundOf` is already computed in `plugin.ts`, so it is passed down. Open point for apply: whether the starter type can name `BoundOf<H, E>` without a cycle; if it cannot, the fallback is `Context<E>` plus the fields the bus has through `ContextOf<E>`, and the bound effects stay off the type of the child until a follow-up.

**`timeout`.** Its starter gets the child it already makes; the existing `{ signal, abort }` shape is a subset.

## Risks / Trade-offs

- **`scopePlugin` matches a context to an emit by type and payload** (AGENTS.md). The child has the type and payload of its parent, so during the synchronous start of a handler the child can match the pending layers. That is harmless: they are the layers the parent has, now bound to the child. Test it with a scope and a race inside the handler.
- **A group is a fork too** (`withGroup` forks `ctx`), so it gets the rebinding as well: one extra `adopt` per group. Measure with `scripts/bench-scope.mjs`.
- **Core grew by one symbol property** on each context (`createBus` 1.27 → 1.29 kB brotli, limit 1.3). A `WeakMap` for it was tried first and made a task with a plugin about 75% slower; the property costs nothing measurable in `scripts/bench-scope.mjs`.
- **Larger object per starter**: `createTask` already builds it; passing it costs nothing. Measure `bench` of `all` with 10 000 starters before and after.
- **Spreading or serialising the argument** shows more keys: accepted.
- **Type complexity** of the overloads of `race`: keep `src/tests/types.test.ts` cases for the object form, the array form and each of `{}`, `{ signal }`, task context.
