# Design

## Context

`src/observable.ts` holds `createObserve`, the `Observable` types and `$$observable`. An instance of a class from `extendBus` has `on`, `once`, `off` and `emit` on its prototype, and its `on` puts the subscription in the registry of `src/oop/subscriptions.ts`, so `dispose()` removes it. Those methods exist while the constructor of `Base` runs. `nanoeffects/observable` has the size limit `0.5 kB` and no `notrace` build. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A Subject that is the event itself: `subscribe` is `source.on`, `next` is `source.emit`.
- A class, so that a user can extend it.
- A Subject over an instance of an `extendBus` class is ended by `dispose()` with no code in `oop`.

**Non-Goals:**
- `complete`, `error`, `BehaviorSubject`, `ReplaySubject`, operators or `pipe`. The bus keeps no values, and RxJS does these through `Symbol.observable`.
- Events that are action creators or commands. The first version takes the event names of the map, as `createObserve` does. Creators can be added later without a break.
- A subject for a predicate (`matchPlugin`).
- A `subject` method on the instances of `extendBus`, a plugin, or a change in `src/oop`.

## Decisions

**A class over a source with `on` and `emit`.** `Subject` stores `source` and `event`. `subscribe` calls `source.on(event, handler)` and returns `{ unsubscribe }` from what `on` returns. `next` calls `source.emit(event, payload)`. The source is only a structural type (`on` and `emit` of a bus), so a bus and an instance of an `extendBus` class both fit. Alternative: `createSubject(bus, event)` plus `this.subject(event)` on the instances. Rejected: two entry points, code in `oop`, and `BusMethods` would need `subject`, which a class decorated with `@WithBus` would not see.

**`dispose` comes from the instance's own `on`.** `new Subject(this, "typed")` subscribes through `this.on`, which is already the per-instance version of `extendBus`. Nothing in `oop` knows about `Subject`. The source is read when `subscribe` is called, so `this.on` is the one with the registry. Alternative: a special case in `extendBus`. Rejected: it couples `oop` to the Observable side and costs bytes there.

**`next` is bound in the constructor.** `this.next = this.next.bind(this)` makes `const { next } = subject` work, and since `bind` reads `this.next` at construction, a method that a subclass defines on its prototype is the one bound. Alternative: `next = (payload) => …` as a class field. Rejected: a field is an own property, so a subclass could not call `super.next`. Alternative: leave `next` on the prototype unbound. Rejected: the callback use (`input.addEventListener("input", subject.next)`) is the main one.

**Types.** `Subject<E extends EventMap, K extends Keys<E>>` with `source: Pick<Bus<E>, "on" | "emit">` and the payload `E[K]`. The event map is the one of the bus, so the event name and the payload are checked together, as in `createObserve`. A plain `Subject<string>` is not used, because it cannot check the event name. Open point for the implementation: whether an instance of an `extendBus` class (its `on` and `emit` come from `BusMethods<B>`) is assignable to that source type without a cast. The type test in `types.test.ts` decides; if it is not, the source type is widened to the smallest structural shape that fits both, not a cast.

**`createObserve` stays as it is.** It could be `new Subject(bus, event)` seen as an Observable, but then its result would have `next` and the spec says it has none. The few lines of observer handling are shared inside `src/observable.ts` by a local function; no new module.

## Risks / Trade-offs

- [`observable` grows] → measure `dist/observable.js` with `pnpm size` before and after; the limit is `0.5 kB`. Raise it only after asking. Baseline (brotli): `observable` 119 B, `oop` 2.36 kB of 2.5 kB, `createBus` 1.27 kB.
- [An instance does not fit the source type] → see Types: widen the structural shape, test it, no cast.
- [`new Subject(this, …)` in the constructor of `Base` runs before the fields of a subclass exist] → `Subject` reads only `source` and `event`, which it stores itself; the registry is outside the instance for the same reason.
- [`next` bound in the constructor adds an own property] → one function per subject; accepted, a subject is made once and kept.
- [A subscription after `dispose()`] → follows `this.on`: a new `dispose()` ends it. No new rule.
- [`next` throws in a handler] → as `emit`: the first error is thrown unless `onError` is set. `Subject` adds no handling.
