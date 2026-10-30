# Design

## Context

`take` (src/effects/take.ts) subscribes with `ctx.on(event, listener)` and unsubscribes when done. `ctx.on` is `On<E>` of the bus, which already takes an event name, an action creator with or without a payload type, and a command. `take` is typed for names only: `K extends Keys<E>` and `E[K]` as the payload. `effectsPlugin` binds `take` to the context with the same name-only type (`Bound<E>["take"]`). See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- Pass a creator to `take`, with the payload type of the creator, in the free form and in the bound form.

**Non-Goals:**
- A predicate over the action, commands, a change in the core or in the traced events.

## Decisions

- **Pass the creator to `ctx.on`, do not read `.type`.** `ctx.on` already resolves a creator to its type, so `take` hands over what it was given. No new code path in the subscription, and `take` follows whatever `On<E>` does for creators later.
- **Overloads, not a union.** A union of `K | ActionCreator<P>` would lose the link between the argument and the payload type. The overloads of `take`, in this order, as `On<E>` orders them (the free creator before the one with a payload type, as AGENTS.md asks):
  1. a name `K`, with a type guard `predicate` (as now);
  2. a name `K` (as now);
  3. a `FreeActionCreator<K>`, with a type guard, and without: the payload is `E[K]`;
  4. an `ActionCreator<P>`, with a type guard, and without: the payload is `P`.
  The guard overloads come first for each form, so a type guard narrows and a plain predicate does not.
- **The bound `take` mirrors the overloads.** `Bound<E>["take"]` in src/effects/plugin.ts becomes the same overload set without `ctx`. This is a type change only; at run time the plugin already forwards its arguments.
- **Tracing is untouched.** `take` is a traced group (`withGroup("take", ctx, …)`); the group does not name the event, and the subscription is made by `ctx.on`, so the trace is the same for a name and a creator. A test confirms that the events recorded for the two forms are equal.
- **No `notrace` change.** The file has no trace-only code; the `notrace` build compiles the same overloads.
- **The example.** `examples/counter` writes `take(ctx, incrementCancelled, { signal })` in both handlers and drops the comment about the name. The counter is checked by `pnpm tsgo` against `src`, which is the check that the overloads work for a creator of `nanoeffects/actions` (plain page) and for an RTK `createAction` (Redux page).

## Risks / Trade-offs

- [An RTK `createAction` with no payload is an `ActionCreatorWithoutPayload` and may not match `ActionCreator<P>`] → `bus.on` already takes it (the Redux page of the counter does), so the same overload shape is used; the type test covers an RTK creator.
- [More overloads make errors harder to read] → there are four, ordered like `On<E>`; the type tests pin the messages that matter with `@ts-expect-error`.
- [A reader expects `take(ctx, predicate)` next] → the docs name `race` over several `take` calls for "any of these events" and `matchPlugin` for a predicate subscription.

## Open Questions

None that change the specs.
