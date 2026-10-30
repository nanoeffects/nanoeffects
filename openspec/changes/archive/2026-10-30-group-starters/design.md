# Design

## Context

`all(ctx, effects)`, `allSettled(ctx, effects)` and `race(ctx, effects)` take a context first and an array or an object of starters second (spec `starter-context`). A group calls each starter with the context of its child task. `delay`, `take`, `retry`, `timeout` and `poll` can already be starters (spec `effect-starters`), so the only starter that still needs a wrapper is a group. See proposal.md for the motivation.

`effectsPlugin` binds `race`, `all` and `allSettled` to a context and calls the free function as `effect(ctx, ...args)`, always with two arguments, so the bound `race({ … })` is unaffected.

## Goals / Non-Goals

**Goals:**
- `all(effects)`, `allSettled(effects)` and `race(effects)` are valid values in a group.
- The `ctx` forms keep their result, types and trace. A one-argument call of today fails, so no working call changes.

**Non-Goals:**
- A Task form of the three effects, new names, `cancellable`.
- A change in `src/core` or in the trace contract.

## Decisions

### 1. The number of arguments tells the forms apart

One argument is the short form, two are the `ctx` form. This is simpler than looking at the type of the first argument, because effects and a context are both objects. A single argument that is a context, an object whose `signal` is an abort signal (`typeof signal === "object"`), is a mistake (`all(ctx)`) and throws a `TypeError` that says the effects are missing, before anything starts.

The owner's first sketch said an effects object must not have a `signal` key. The rule above is weaker and better: a starter is a function and an abort signal is an object, so `all({ signal: (child) => … })` is effects and works. The only objects the check refuses are those whose `signal` is an object, which are never valid effects.

*Alternatives:* (a) decide by the first argument being an array or an object without `signal` — rejected: it refuses a valid `signal` key and reads the same data twice; (b) `fn.length` — rejected as in `curried-starters`.

### 2. The starter runs the `ctx` form with its child

The short form returns `(child) => all(child, effects)` (the same for the other two). The group, the `run` children and the cancellation are made by the same code with the same child, so the trace is the same by construction, and the inner group is a child of the `run` task of the outer starter. Aborting the outer starter aborts the child, which aborts the inner group, which cancels its starters (`cancelAfter` as it is today). A test through the recorder pins both.

### 3. A group starter holds no state

It closes over `effects` only, so one value can serve two outer groups. `effects` is read when the starter is called, not when it is made, as the `ctx` form reads it.

### 4. Types: overloads, the child type from the outer group

The new overloads come after the `ctx` ones and return `(child: C) => Promise<…>`, with the result shape of the `ctx` form (`Awaited` of each starter, `PromiseSettledResult` for `allSettled`, optional keys for `race`). The child type `C` and the elements' child type `ChildOf<C>` are inferred from the outer group as in `curried-starters`; a stored group starter outside a group has nothing to infer from, so it is pinned by the reader, as `take<Events, "x">("x")` is. A first task prototypes the types against `types.test.ts`: the nested inference (`retry` inside `all` inside `race`) is the risk.

### 5. Size and speed

`effects (all)` is 2.63 kB of 2.7 kB. Each effect gains a branch; the one-argument rule is a shared helper, so the growth should be small. The limit moves only if `pnpm size` says so, with the numbers in the commit message. The cost on the `ctx` path is one comparison of `second` per call; a scratch microbenchmark of one `all(ctx, { a })` call before and after confirms it.

## Risks / Trade-offs

- [Nested inference fails in the types] → the prototype is the first task; if `retry` inside `all` inside `race` cannot be inferred, stop and change this design before the rest.
- [`all(ctx)` by mistake] → a clear `TypeError` instead of a failure inside `runGroup`.
- [A stored group starter has no event map] → pinned in TypeScript, shown in the docs, as for `take`.
- [Size] → measured; the limit moves once, if needed.

## Migration Plan

None: additive, a minor release. Rollback is removing the branch and the overloads.

## Open Questions

None that change the specs. If the type prototype fails, that is a design change.
