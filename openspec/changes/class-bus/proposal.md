# Proposal: give a class the methods of a bus with `extendBus` and `@WithBus`

## Why

Services, stores and components that are written as classes need the bus inside their methods: `this.on(...)`, `this.emit(...)`. Today each class keeps a reference to the bus and a list of the unsubscribe functions by hand, and forgets to call them when the object goes away. A class that is made from a bus, with the subscriptions that belong to each instance and a `dispose()` that ends them, is the object-oriented form of a module.

## What Changes

- New entry `nanoeffects/oop` with `extendBus`, `WithBus`, `disposeBus` and the type `BusMethods`.
- `extendBus(bus, Base)` returns a subclass of `Base`: `export const SearchService = extendBus(bus, SearchServiceBase)`. Its instances have `on`, `once`, `off`, `emit`, the other methods that the plugins of the bus gave it, and `dispose()`.
- `bus` is optional. `extendBus(Base)` makes a bus for the class with `createBus()`. All instances of the class share it, and it is the static property `bus` of the class.
- Subscriptions made through `this.on` / `this.once` belong to the instance. `dispose()` (and `[Symbol.dispose]()`) removes them, and only them.
- The class of the user wins any clash of names: a member that `Base` has is not replaced. `disposeBus(instance)` is exported so that a `Base` with its own `dispose` can still end the subscriptions.
- `@WithBus(bus?)` is a class decorator that does the same: `@WithBus(bus) class SearchService { … }`.
- `@On(event, wrap?)` and `@Once(event, wrap?)` are method decorators: the method becomes a handler of `event` for each instance, with `this` bound to the instance, from the construction until `dispose()`. `wrap` is a function of the handler, such as a policy: `@On(queryChanged, latest)`.
- Handlers that are passed to `this.on` by hand are not bound: use an arrow or a decorated method.

## Non-goals

- Binding `this` of a handler that is passed to `this.on` by hand. A policy such as `latest(this.handle)` wraps the function, so the binding would work in half of the cases. A decorated method is bound, and so is an arrow.
- A bus for each instance, mixing the methods into an object that exists, a decorator for fields or for the parameters of a method.
- A change to `createBus` or to the API of the bus.
- Methods of plugins used after `extendBus`: they are not on the class (the names are taken when `extendBus` runs).

## Capabilities

### New Capabilities

- `class-bus`: classes made from a bus: the methods, the bus of a class, the subscriptions of an instance and `dispose`, the order of names, the decorator, and the types.

### Modified Capabilities

None.

## Impact

- New: `src/oop/` (`index.ts`, `extend.ts`, `decorator.ts`, tests), the entry in `package.json` (`exports`, `size-limit`), `tsdown.config.ts` (main build only, like `scope` and `match`), the aliases `nanoeffects/oop` in `tsconfig.json` and `vitest.config.ts`.
- Docs: a new page `docs/oop.md`, a row in `docs/package.md`, links in `llms.txt` and `docs/README.md`, a line under "See what is not a plugin" in `docs/plugins.md`, `CHANGELOG.md` (`Unreleased`), one line in `AGENTS.md`.
- `createBus` must be the same size before and after (measured).
