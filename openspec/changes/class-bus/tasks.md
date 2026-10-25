# Tasks: class-bus

## 1. Types first (gate)
- [x] 1.1 Write `BusMethods<B>` and the overloads of `extendBus` in `src/oop/`, and type tests in `src/tests/types.test.ts`: an instance has `on`, `emit`, `dispose`; the methods of a plugin appear when the bus has it; the constructor parameters of `Base` are kept; `instanceof Base` narrows; a member of `Base` named like a bus method keeps its type; the form without a bus; a decorated class with `interface … extends BusMethods`. Verify: `pnpm tsgo`. If the type of the clash cannot be kept, settle it in `design.md` (Types) before the code

## 2. The entry
- [x] 2.1 `src/oop/extend.ts`, `src/oop/decorator.ts`, `src/oop/index.ts`: `extendBus`, `WithBus`, `disposeBus`; the names decided once with `in Base.prototype`; the subscriptions in a `WeakMap`; the getters that return bound functions. Add the entry to `package.json` (`exports`, `size-limit`), `tsdown.config.ts` (main build), `tsconfig.json` and `vitest.config.ts` aliases. Verify: `pnpm build`, `pnpm lint:package`, `pnpm size`, and `createBus` is the same bytes as before (measured)
- [x] 2.2 Tests in `src/oop/extend.test.ts`: the class and the constructor, the name, `instanceof`, the methods on the bus, destructuring, the bus of a class and its sharing, the bus that is passed, plugin methods before and after, the subscriptions and `dispose` in all the cases of the spec, `Symbol.dispose`, the clash of names for each name, `disposeBus` from an own `dispose` and on another value, an arrow keeps `this` and a bare method loses it. Verify: `pnpm vitest run`
- [x] 2.3 Tests in `src/oop/decorator.test.ts`: `WithBus(bus)(Base)` and `WithBus()(Base)` behave as `extendBus`; the decorator syntax where the toolchain allows it. Verify: `pnpm vitest run`
- [x] 2.3a Method decorators in `src/oop/methods.ts`: `On(event, wrap?)` and `Once(event, wrap?)` for both kinds of decorators, the registry keyed by the function, the scan of the prototype chain once for each class, the subscriptions made in the constructor of the extended class. Types: the payload of the method is typed from the event (a name of the bus, an action creator, a command); a mismatch is an error. Tests in `src/oop/methods.test.ts` for every scenario of the spec (this bound, an instance each, `@Once`, `wrap` with `latest`, `dispose`, creator and command, inherited and overridden, both kinds of decorators, a class that is not made by the entry). Verify: `pnpm tsgo && pnpm vitest run`
- [x] 2.4 Leak test with `WeakRef` (`settleGarbage`, `aliveCount`): disposed instances and their handlers are collectable, and the bus does not keep a disposed instance. Verify: `pnpm vitest run`
- [x] 2.5 Add the class entry to `src/tests/plugin-matrix.test.ts` only if it is a small probe (an instance of a class made after the plugins, with `matchPlugin` and `emitterPlugin`). Verify: `pnpm vitest run src/tests/plugin-matrix`

## 3. Documentation
- [x] 3.1 `docs/oop.md`: JavaScript first, with the bus, the events and the class in separate files as in AGENTS.md; sections for extending a class, letting the class make its bus, `dispose` and `disposeBus`, the decorators `@WithBus`, `@On` and `@Once` (with `wrap`, and what the constructor of `Base` does not see), the types (optional), and what is not done (a handler given by hand is not bound, methods of plugins used later). Verify: `pnpm docs:check`
- [x] 3.2 `docs/package.md` row, a link in `llms.txt` and `docs/README.md`, a line under "See what is not a plugin" in `docs/plugins.md`, CHANGELOG `Unreleased`, one line in `AGENTS.md`. Verify: `pnpm docs:check && pnpm llms:check`

## 4. Verify
- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`. Verify: all green

## Workflow follow-up
- Archive the change with `/opsx:archive`; the version is the owner's choice when the release is prepared.
