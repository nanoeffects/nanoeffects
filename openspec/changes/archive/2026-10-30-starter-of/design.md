## Context

A group gives each starter the context of its child. `all`, `allSettled` and `race` without `ctx` return `(child: Child) => Promise<…>`, and `Child` is inferred from the outer group the starter sits in (spec `effect-starters`, change `group-starters`). Assigned to a variable, the starter has no outer group, so `Child` is not inferred; the contextual return type of an annotated variable supplies it instead. This is the only thing the annotation does. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- A short, readable annotation for a stored starter, with an optional result type.

**Non-Goals:**
- A runtime helper, or any change to how the effects infer.
- Changing the internal `Starter<T, Child>`.

## Decisions

### 1. An alias of the existing `Starter`

`type StarterOf<E extends EventMap, R = unknown> = Starter<R, Context<E>>`, in `src/effects/run.ts` beside `Starter`, exported from `src/effects/index.ts`. `Starter<T, Child>` is `(child: Child) => T | PromiseLike<T>`, which is what a group accepts, so a value of `StarterOf` is accepted by `race`, `all`, `allSettled` and `timeout` with no further type. No new shape to keep in step with `Starter`.

*Alternative:* a new standalone function type — rejected: two definitions of one thing would drift.

### 2. The name and the parameters

`StarterOf<Events>` reads as "a starter of this bus". The event map is the first parameter because the reader always writes it; the result `R` is second and defaults to `unknown`, because most stored starters are not used for their value. `Context<E>` already requires `E extends EventMap`, so the constraint is the same.

### 3. The default result is `unknown`

`const load: StarterOf<Events> = all({ … })` loses the result type of `load`, the same as the annotation it replaces (`Promise<unknown>`). A reader who needs the value writes `StarterOf<Events, { user: User }>`. It is not inferred from the right side because an annotated variable keeps the annotation.

### 4. Docs say when it is not needed

Next to the sentence on stored starters in `docs/effects.md`: a starter written inline in a group needs no annotation, because the group gives its type; `StarterOf` is for a starter kept in a variable or returned from a function.

## Risks / Trade-offs

- [The reader annotates an inline starter out of habit] → the docs say it is not needed.
- [`R` is easy to get wrong because a starter may return a promise] → `StarterOf<E, R>` takes the awaited type `R`, as the result of `race` does; a scenario pins it.

## Migration Plan

None: a new export. Rollback is removing it.

## Open Questions

None.
