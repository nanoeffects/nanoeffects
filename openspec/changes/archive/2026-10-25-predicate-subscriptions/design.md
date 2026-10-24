# Design: `matchPlugin`

See `proposal.md`. The requirements are in `specs/predicate-subscriptions/spec.md`.

## Context

- `createBus` has `on`, `once` and `off` as plain functions. `once` calls the inner `on`, not `bus.on`, and `off` is the inner one; a plugin that replaces `bus.on` therefore does not change `bus.once` or `bus.off`.
- `ctx.on` reads `bus.on` each time it is called, so the wrapper is seen by tasks that are made after the plugin is used. `ctx.off` is `bus.off` as it was when the task was made.
- `"*"` listeners run after the listeners of the event, once for each emit, as a task. They count as heard for `onUnhandled`.
- `devPlugin` also wraps `bus.on`.
- `take` has `predicate: (payload) => boolean`, with type guards, over one named event.

## Goals / Non-goals

- Goals: a predicate in the place of the event, with type guards; the core unchanged; behavior that follows from `"*"` and needs no new rules.
- Non-goals: patterns, a way to find which predicate matched, any change to `take`.

## Decisions

### A plugin that wraps `on`, `once` and `off`

`matchPlugin()` replaces the three methods on the bus object and returns it. Each wrapper checks the first argument; if it is not a predicate it calls the original, unchanged. This keeps `createBus` as it is and puts the cost on the buses that ask for it. The alternative, a branch in the core `on`, adds bytes to every bus.

### What is a predicate

A function with no string `type`. An action creator and a command have one; an arrow function does not. The test is `typeof fn === "function" && typeof fn.type !== "string"`. A creator that lost its `type` would be taken for a predicate; that is a bug in the creator, and the types do not allow it.

### A predicate rides on `"*"`

`on(predicate, handler)` adds `(payload, ctx) => { if (predicate({ type: ctx.type, payload })) return handler(payload, ctx); }` to `"*"` through the original `on`. So the order (after the listeners of the event, then by subscription), the task for each event, tracing, `onError` and `onUnhandled` are those of `"*"`. The handler is called in the task of that listener, whose `ctx.type` is the type of the event. Policies around the handler need nothing: they wrap the handler before it is passed.

The price is stated in the docs: one task per predicate subscription for each emit, and an event heard only by a predicate that says no is not reported by `onUnhandled`. A way around both would need a hook in the core, which is not worth it for this feature.

### Keeping the wrappers findable for `off`

The wrapper made for `(predicate, handler)` is kept in a `Map` per bus: predicate → handler → wrapper(s). `off(predicate, handler)` finds the wrapper and removes it; `off(predicate)` removes every wrapper of the predicate and the entry. The unsubscribe function, `once` after its match and an aborted `ctx.on` remove the wrapper and clear its entry. `off()` with no arguments clears the bus, and the map is cleared with it (the plugin wraps `off` for this). A handler added twice with the same predicate gives two wrappers, and `off(predicate, handler)` removes one, as `off(event, fn)` does for events.

### `once`

The core `once` removes the subscription at the first event. For a predicate it must be the first event that matches, so the wrapper unsubscribes itself inside the matching call, before it calls the handler, which is what the spec says ("removed before it is invoked").

### Types

`matchPlugin` returns `Bus<E>` with `on`, `once` and `off` typed as the original overloads plus:

```ts
<A extends Action<E>>(guard: (action: Action<E>) => action is A, fn: Task<A["payload"], E>): UnsubscribeCallback;
(predicate: (action: Action<E>) => boolean, fn: Task<EventPayload<E>, E>): UnsubscribeCallback;
```

with `off` taking the predicate and an optional `fn`. The new overloads come after the existing ones, so an event name, an action creator and a command are matched as before. Whether the plugin should return an intersection or a re-typed bus is decided against `types.test.ts`: it must keep `bus.on("name", fn)` inference exactly as it is now.

`ctx.on` inside handlers is typed by `Context<E>`, not by the plugin, and it cannot get the predicate overload without a change to `src/core/bus.ts`, which this change does not make. So `ctx.on(predicate, …)` and `ctx.off(predicate, …)` work at run time, are not in the types, and the docs say so; the tests take them as `MatchApi<E>["on"]`. Checked in the first task: the inference of an event name, a creator and a command on a bus with the plugin is the same as before, and a type guard narrows the payload.

### Any order with `devPlugin`

Both plugins replace `bus.on`, and the one used last is on top. Two things went wrong with that, and both are fixed so that the order does not matter:

1. `devPlugin` counts listeners with `eventKey(event)`, which for a predicate (a function with no `type`) is `undefined`. If `devPlugin` is on top it would count and name `undefined`. Now it counts a predicate under `"*"`, where the subscription really listens.
2. The function that `devPlugin` returns did `bus.on = original`, which also removes a wrapper put on `bus.on` after it, for example `matchPlugin`, and so turns predicates off without a word. Now it restores `bus.on` only if its wrapper is still on top. If not, it leaves the wrapper in place and makes it pass every call through without counting.

`matchPlugin` keeps the `on` it found when it was used and calls that one for its own subscription on `"*"`. With `devPlugin` below it, the call reaches `devPlugin` once, as `"*"`. With `devPlugin` on top, `devPlugin` sees `(predicate, handler)`, names it `"*"`, and calls down once. So a predicate subscription is counted once in both orders.

### The entry

A new entry `nanoeffects/match`, in the main build only, with its own `size-limit` line. The alternative of putting the plugin in `nanoeffects/actions` would raise a limit that has little room left.

## Measured

`createBus`: 4190 B raw, 1748 B brotli with its chunks, before and after (the plugin is not imported by it). `nanoeffects/match`: 382 B brotli (limit 0.5 kB). Emit of 100 000 events, one listener, mean of 30 rounds, one process each: 14.2 ms without the plugin before the change, 14.1 to 14.6 ms after, 14.1 to 14.4 ms with the plugin and no predicate, 26 ms with one predicate subscription (about 120 ns more for each event, the task of the `"*"` listener).

## Risks / Trade-offs

- [A task for every emit] → Documented; for a few known events `on(creator, handler)` is cheaper.
- [Two plugins wrapping `bus.on`] → Both orders work; see "Any order with `devPlugin`".
- [The type of `ctx.on`] → See Types; the first task decides.
- [Leaks through the map] → Entries are removed with the subscription; the leak test covers all four ways of removing.

## Migration Plan

None: new, opt-in. CHANGELOG `Unreleased`; the next release is a minor one.

## Open Questions

- The name of the plugin (`matchPlugin`) and the entry (`nanoeffects/match`) can still change before release without changing the requirements.
