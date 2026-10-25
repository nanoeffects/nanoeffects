# Design: classes made from a bus

See `proposal.md`. The requirements are in `specs/class-bus/spec.md`.

## Context

- The bus is an object of closures. Its methods do not read `this`, so they can be copied and destructured.
- Plugins add methods to the bus object (`emitter`, `useEmitter`, a wrapped `on`, `once`, `off`). The slots of the bus (`ctx`, `commands`, `trace`, `addContext`, `applyScope`, `fitScope`) are data or hooks, and `use` is how plugins are applied.
- `matchPlugin` replaces `on`, `once`, `off` of the bus object. Calling `bus.on` at the time of the call sees whatever is on top.
- A class that extends another one can add methods to the prototype of the subclass; they are visible in the constructor of the base (the prototype of the instance is the one of `new.target`), but the fields of the subclass are not set until `super()` returns.

## Goals / Non-goals

- Goals: the methods of a bus on a class, subscriptions that end with the instance, the user's class wins, one decorator, types that follow the bus.
- Non-goals: see `proposal.md`.

## Decisions

### A subclass with methods on the prototype

`extendBus(bus, Base)` returns `class extends Base { … }` named like `Base`. Its prototype gets `on`, `once`, `off`, `emit`, the methods of the plugins, `dispose` and `[Symbol.dispose]`. Prototype methods read `this` as the instance, which they need for the subscriptions of the instance; so, unlike the bus, they cannot be destructured and keep the instance. The one exception is `emit`, which needs no instance and is defined to work destructured as well: the requirement for destructuring is for `emit`, and `on` and `once` bound to the instance are not required to survive destructuring.

Wait: the spec says the methods can be destructured. To keep that true for `on` too, the methods are defined as getters on the prototype that return a function bound to the instance (made once and cached in the `WeakMap` of the instance). This keeps `const { on } = this` working, and costs a bound function for each method an instance uses.

### Names are decided once

The names to add are `on`, `once`, `off`, `emit`, the function-valued keys of the bus that are not slots, `dispose`, `bus`, and the symbol `Symbol.dispose`. For each name, `name in Base.prototype` decides: if it is a member of `Base` (own or inherited), nothing is added. The function-valued keys of the bus are read when `extendBus` runs, so plugins used later are not seen.

### Subscriptions are in a `WeakMap`

`this.on(event, handler)` calls `bus.on` and keeps the unsubscribe function in a `Set` that is in a `WeakMap` keyed by the instance, created at the first use. A field would not be there yet when the constructor of `Base` subscribes. The function that is returned to the caller removes the subscription and also removes it from the set, so a subscription that is ended in any way is not held. `once` wraps the handler so that the set forgets it when it fires. `off(event, handler)` asks the bus to remove it, and drops the entry whose handler is that one. `dispose()` takes the set out of the `WeakMap` first and then calls each unsubscribe function, so a second call finds nothing.

`disposeBus(instance)` is the body of `dispose()` as a function. A class with its own `dispose` calls it.

### The bus of a class

`extendBus(Base)` calls `createBus()` and uses the result as if it had been passed. The bus is stored on the class as a static `bus` and on the prototype as a getter, unless `Base` already has a member of that name.

### Method decorators: a registry of functions

`@On(event, wrap?)` and `@Once(event, wrap?)` work in the two kinds of decorators the same way. A method decorator is called as `(value, context)` in the standard form and as `(target, key, descriptor)` in the legacy form; the function of the method is `value` or `descriptor.value`. The decorator puts `{ event, wrap, once }` in a `WeakMap` keyed by that **function**, and returns the method unchanged. No `addInitializer`, no `Symbol.metadata`, no state on the prototype.

The class made by `extendBus` reads the registry when it builds an instance, after `super(...)` has returned: it looks at the own methods of each prototype in the chain (found once for each class and kept in a `WeakMap` by constructor), and for each method that is in the registry it calls `this.on` or `this.once` with a handler `(payload, ctx) => method.call(this, payload, ctx)`, passed through `wrap` when there is one. These are subscriptions of the instance, so `dispose()` removes them with the rest. Because the key is the function, a method that a subclass overrides is subscribed only if the override is decorated, and an inherited one is found on the prototype of the parent.

The cost of the scan is paid once for a class. The cost of an instance is one subscription for each decorated method. A decorator on a class that is not made by `extendBus` leaves an entry in the registry that nothing reads.

`wrap` receives the bound handler, so a policy sees a function that already has `this`: this is how `@On(event, latest)` works where `latest(this.handle)` does not.

The subscriptions of the decorators are made after the constructor of `Base`. An event that is emitted inside that constructor does not reach them; the docs say so.

### The decorator

`WithBus(bus?)` returns `(Base) => extendBus(...)`. A class decorator receives the class as the first argument in both the standard form and the legacy form (`experimentalDecorators`), and a returned class replaces it in both, so one function serves both. TypeScript does not change the type of a decorated class, so the docs show an `interface` with the same name that extends `BusMethods`.

### Types

```ts
type Slots = "ctx" | "commands" | "trace" | "addContext" | "applyScope" | "fitScope" | "use";
type BusMethods<B> = { [K in keyof B as K extends Slots ? never : B[K] extends Function ? K : never]: B[K] }
  & { dispose(): void; [Symbol.dispose](): void; readonly bus: B };
```

`extendBus` has two overloads and returns `C & (new (...args: ConstructorParameters<C>) => InstanceType<C> & BusMethods<B>)` with the members of `Base` taking priority in the type where the names clash (an `Omit` of the bus methods by the keys of `InstanceType<C>`). The exact shape is settled against `types.test.ts` in the first task. The rule against `as unknown as` applies; the implementation has the casts only at the border where a class is built.

### The entry

`nanoeffects/oop`, main build only, with its own `size-limit` line. It imports `createBus` only for the form without a bus, so the entry that does not use that form still bundles it; the cost is small and is measured.

## Risks / Trade-offs

- [Getters that return bound functions cost memory for each method an instance uses] → Made at first use, cached; an app with many thousands of instances that never destructure pays for `on` once per instance only if it uses it.
- [Plugins used after `extendBus` are not seen] → Documented; the same kind of rule as the order of plugins in `docs/plugins.md`.
- [A `Base` with its own `dispose` never cleans up] → `disposeBus` exists for this and is in the docs.
- [Decorator syntax and the tooling of the project] → The decorator is tested as a function call, `WithBus(bus)(Base)`, which is the same code; the syntax `@WithBus(bus)` is tested only where the toolchain supports it, and checked by `docs:check` in the docs.
- [The type of a decorated class] → The `interface` merging in the docs; an `extendBus` call has exact types.

## Migration Plan

None: new, opt-in. CHANGELOG `Unreleased`.

## Open Questions

- Whether a later change adds `@on(event)` for methods, which would also solve the binding of `this`. Out of scope here.
