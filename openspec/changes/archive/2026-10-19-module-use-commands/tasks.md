# Tasks

## 1. The registry on the bus

- [x] 1.1 `createCommands(bus, bindings?)` makes the registry, sets `bus.commands` to it and returns it; the events type is inferred from `bus`. Verify: `pnpm tsgo` clean and the tests of the registry itself (`handle`, bindings, the last binding wins) pass with the new call.
- [x] 1.2 Remove `commands` from `BusOptions` and from the bus literal in `src/core/bus.ts`; `emit` keeps reading `bus.commands`. Verify: `createBus({ commands })` is a type error (`@ts-expect-error` test) and `pnpm tsgo` is clean.
- [x] 1.3 `registerModules` uses the registry of the bus or attaches one with `createCommands(bus)`. Verify: the existing tests of `registerModules` pass with the new wiring.
- [x] 1.4 Move every call site of `createBus({ commands })` to `createCommands(bus)`: `src/actions/command.test.ts`, `register-modules.test.ts`, `src/tests/context-option.test.ts`, `src/tests/test-helpers.ts`, and any use in `integration/` and `examples/`. Verify: `pnpm tsgo` and `pnpm vitest run` pass.

## 2. use takes commands

- [x] 2.1 `ModuleContext.use` takes `Array<Module<E> | Command<never, unknown>>`; a command is bound with the same internals as `handle(command, command)`, a module is mounted as before; the returned function undoes all of the call. Verify: `pnpm tsgo` clean and the existing `use(module)` tests pass unchanged.
- [x] 2.2 Update the doc comments of `use`, `ModuleContext`, `registerModules` and `createCommands`. Verify: `pnpm check` clean.

## 3. Tests

- [x] 3.1 Tests for `createCommands(bus)`: handlers registered after the bus exists, initial bindings, a second registry replaces the first, a custom runner assigned to `bus.commands`, a bus without a registry runs the command itself and throws `MissingHandlerError` for a contract. Verify: the new tests pass.
- [x] 3.2 Tests for `use` with commands in `register-modules.test.ts`: results of `emit`, the binding in `app.commands`, a mix of commands and a sub-module in one call, unmount removes the binding while an override stays, the returned function undoes only its call, a later `handle` wins and unbinding brings the bound one back, replacement of the module by name. Verify: the new tests pass.
- [x] 3.3 Type tests in `src/tests/types.test.ts`: `createCommands(bus)` infers the events, `m.use(command, module)` compiles, a wrong item and the old option do not (`@ts-expect-error`). Verify: `pnpm tsgo` clean.

## 4. Docs and examples

- [x] 4.1 `docs/guide.md` steps 5 and 10, `docs/actions.md`, `docs/stores.md` and `examples/` use `createCommands(bus)`, show `m.use(getUser, saveUser)` for commands with a handler and `m.handle` for a contract. Verify: `pnpm tsgo` type-checks the examples and `src/tests/guide.test.ts` passes.
- [x] 4.2 `AGENTS.md` (the decision on `bus.commands`: no constructor option, `createCommands(bus)` attaches) and `CHANGELOG.md` under `0.1.0`. Verify: both match the docs.

## 5. Verification

- [x] 5.1 `pnpm verify` passes, and `createBus` stays within its size limit (it should shrink). Verify: the command exits 0 and `pnpm size` passes.

## Workflow follow-up

- After apply: `openspec archive module-use-commands` moves the deltas into `openspec/specs/module-commands/` and `openspec/specs/command-registry/`.
