# Design

## Context

A starter is a function `(child) => value | Promise`; `race`, `all`, `allSettled` and `timeout` call each one with the context of a child task they make (spec `starter-context`). `retry`, `timeout` and `poll` already have a second form that drops `ctx` and tells it from the first by the first argument (spec `effect-composition`, "Both forms are supported"). `effectsPlugin` binds `delay` and `take` to a task context, so a handler can write `({ delay }) => delay(1000)`; that is another way to get a short starter, and it stays. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- `delay(1000)` and `take(event)` are valid values in `race` / `all` / `allSettled`.
- Nothing that works today changes: results, types, trace.
- Reading the first argument is the only cost on the old path.

**Non-Goals:**
- A generic `curry`, or the same form for every effect.
- A Task form for `delay` / `take` (`(payload, ctx)`): a starter takes only the child.
- A change in `src/core`, in `createBus` or in the trace contract.

## Decisions

### 1. The form is chosen by the type of the first argument

An object that is not a function is a context (`{}` included); a number, a string or a function is the short form. For `delay` the short form's first argument is a number or a function; for `take` it is a string or a function (an action creator is a function). A context is never any of those, so the ambiguity that was feared (`{}` against an options object) does not exist for these two: neither takes options first. The check is a small function shared by `delay` and `take` (a context is an object, not a function), not a brand on the starter.

*Alternatives:* (a) decide by `fn.length` — rejected: optional parameters and rest arguments change `length`, and `retry(ctx, fn)` could not be told from a partial call; (b) a generic `curry` — rejected: it loses the type parameters of `take` and `retry`; (c) a brand on the context — rejected: `{}` and `{ signal }` are valid contexts by design (AGENTS.md: "outside a task pass `{}`").

*Future effects:* an effect whose first argument can be an options object needs another rule. That is a reason to add the short form one effect at a time, not to make it a rule of the library.

### 2. The starter does the work when called, so the trace is unchanged

The short form returns `(child) => delay(child, ms)` / `(child) => take(child, event, options)`. All the work, `traceTask`, the listener and the timer, is in the call, with the same `child` the group made. The trace is the same by construction; a test through the recorder proves it. `ms` as a function is read at the call, so a stored starter gives a new jitter for each group.

### 3. A starter holds no state

It closes over `ms`, `event` and `options` only, so one starter can be used in several groups (`const pause = delay(100)`). `options.signal` of `take` is kept as given and is combined with the child's signal as in the `ctx` form.

### 4. `await delay(1000)` outside a group is not trapped at run time

The typed result is `Starter<void>`, not `Promise<void>`, so passing it where a promise is expected is a type error. `await delay(1000)` is allowed by the checker (awaiting a function), and returns the function. A runtime trap (a `then` that throws, or a warning in `nanoeffects/dev`) was considered and dropped: a `then` makes the starter look like a promise to `race` and `all`, and `devPlugin` wraps the bus and never sees a function that was dropped. The mitigation is the lint rule for awaiting a non-promise (`await-thenable`), a sentence in `docs/effects.md`, and a name in the docs example that reads as a starter. If this bites in practice, the trap is a later, separate change.

### 5. Types: overloads, in the order the code already uses

For `take` the new overloads go after the `ctx` ones and keep the order the file documents (a creator without a payload type before one with a payload type, as in `On<E>`); the event map is not known without a context, so it is inferred from the context type that the group gives the starter (checked by a prototype, covered by `types.test.ts`). A guard in `predicate` narrows the result as it does now.

### 6. `effectsPlugin` is unchanged

The plugin binds the function it is given with `effect(ctx, ...args)`, so it always calls the `ctx` form. Its hand-written `Bound` types for `delay` and `take` stay: `ctx.delay(1000)` resolves.

### 7. Performance and size are measured, not assumed

Before the change a microbenchmark (a scratch script, not committed) calls `delay(ctx, 0)` and `race(ctx, { a: take(child, event) })` in a loop; after, the same plus the short form. The old path gets one `typeof` on the first argument. `pnpm size` gives the `effects (all)` number; the limit (2.5 kB) is raised only if the measured growth needs it, and the number goes into the commit message.

## Risks / Trade-offs

- [Two forms for one job] → docs name one: the short form inside a group, the `ctx` form in plain handler code. The `ctx` form stays because `bus.on(…, async (_, ctx) => { await delay(ctx, 1000) })` is the common case and has no group.
- [Forgotten `await delay(ctx, …)` turned into `await delay(…)`] → decision 4: type, lint, docs.
- [Overloads make error messages worse] → `types.test.ts` pins the wrong calls with `@ts-expect-error` above the line the checker reports, which for a failed overload is the first argument.
- [A name-only `take("x")` may not infer its payload outside a typed group] → open question below; creators already carry the type.
- [A `take` starter stored in a variable outside a group has no event map to infer] → `const stop = take("b")` types its child as `Context<EventMap>`, which a typed bus does not accept; write it inline in the group, or pin it (`take<Events, "b">("b")`). `delay` has no event map and is not affected. The docs show the inline form.
- [Growth of `effects`] → measured in decision 7.

## Migration Plan

None: additive. A minor release. Rollback is removing the overloads.

## Open Questions

None. The question whether `take("name")` infers its payload inside `race(ctx, …)` was answered by a prototype: it does, because the event map comes from the contextual type of the starter, so names and action creators are both supported.
