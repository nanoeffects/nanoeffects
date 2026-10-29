# Design

## Context

`extendBus` in `src/oop/extend.ts` builds a subclass of `Base` at run time and puts `on`, `once`, `off`, `emit`, `dispose` and `bus` on its prototype. The subscription registry (`subscribe`, `unsubscribe`, `disposeBus`) is in `src/oop/subscriptions.ts`, outside the instance, because `this.on` runs in the constructor of `Base` before the fields of a subclass exist. The decorated methods are found by `decoratedOf` and subscribed in the constructor built by `extend`, after `Base` has run. Today `extendBus(x)` with one argument takes `x` for a class; a bus there throws `TypeError`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A real class to extend, with a capital letter, whose every instance is an independent emitter.
- `extendBus(bus)` with no class, for a bus that instances share, in one call.
- The same subscription, `dispose` and clash rules as `extendBus`; no second registry.

**Non-Goals:**
- Methods of plugins on `Emitter`; a way to pass a bus to `Emitter`.
- Any change in `src/core`, or in the rules of `@On`/`@Once`.

## Decisions

**One bus for each instance, kept outside the instance.** The bus of an instance is made at its first use of `on`, `once`, `off`, `emit` or `bus`, with `createBus()`, and kept in a `WeakMap` keyed by the instance, like the subscription registry. So it works in the constructor of a parent class before the fields of a subclass exist, and the instance does not need a field of its own. A disposed or dropped instance and its bus are collectable. Alternative: a bus for each subclass (a static `bus`). Rejected: two instances of `VideoService` would hear each other, which is not what an emitter does (Node `EventEmitter`, Angular `EventEmitter`). It also needed a loosely typed static `bus` (a static member cannot name the type parameter of the class) and a rule for a subclass of a subclass. A bus that instances share is `extendBus(bus)`.

**No static `bus`.** `Emitter` has no static member for the bus. `service.bus` is `Bus<E>`, fully typed, and that is the only place to read it. Alternative: a static `bus` for the common case. Rejected: with a bus for each instance there is nothing to put there.

**`Emitter` is written by hand as a class, over the existing registry.** Its prototype methods call `subscribe`, `unsubscribe` and `disposeBus` with the instance and its bus, like the forwarding methods in `extend.ts`. `emit` forwards to the bus. The clash rule is free: a method of a subclass overrides the one of the prototype. Alternative: `Emitter = extendBus(class {})` built once. Rejected: that bus is one for every instance.

**Decorators run in the constructor of `Emitter`.** `@On`/`@Once` are subscribed from the constructor with `decoratedOf(prototype)` of the instance, on its own bus, as `extend.ts` does after `Base`. Here that is before the constructor body and the fields of the subclass, because `Emitter` is the first constructor to run. The handlers run later, on events, so `this` has its fields by then; an event emitted in the constructor of the subclass reaches them, unlike with `extendBus`. This is stated in the spec and the docs. Alternative: a microtask. Rejected: timing that depends on the engine.

**`extendBus(bus)` is one more overload.** `extendBus(first)` tells a class from a bus by `typeof first === "function"` (the check that is there already), and for a bus returns `extend(bus, EmptyBase)`; the `TypeError` for a missing class goes. The overload for a class stays first so an object is not read as a class. The type is `Extended<new () => object, B>`. Alternative: a separate function (`busClass(bus)`). Rejected: one more name for the same thing, and the user asked to omit the argument.

**Name `Emitter`.** Short and familiar from Node. It does not clash with `bus.emitter(creator)` of `emitterPlugin`: that is a lowercase method.

## Risks / Trade-offs

- [Two ways to a class with a bus] → `Emitter` for a bus of its own for each instance, `extendBus` for a shared bus or plugins; the docs say so in the first lines.
- [A bus made at first use is created in a hot path] → `createBus` is small and made once for an instance; a `WeakMap` lookup after that. Measured in the leak test with many instances.
- [Decorated handlers see events from the subclass constructor] → documented; the handler runs with a `this` that is not finished only if the event comes from the constructor itself.
- [`oop` grows] → `Emitter` reuses the registry, `createBus` is already imported by `extend.ts`; measure `dist/oop.js` before and after against `2.5 kB` and ask before raising it. Baseline (brotli): `oop` 2.36 kB of 2.5 kB, `createBus` 1.27 kB.
- [Overload order for `extendBus`] → type tests: a class, a bus and a class with a bus each pick the right overload.
- [`docs/oop.md` says a bus for each instance is not done] → fix that line: `Emitter` does it.
