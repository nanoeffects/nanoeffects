# Proposal

## Why

Two things make commands awkward in a module-based app. A command made with a handler already knows how to answer, yet a module that owns a set of commands has to write each handler again with `m.handle(command, fn)`, and `m.use(...modules)` takes only sub-modules. And the command registry is wired in through the constructor, `createBus({ commands: createCommands() })`, although the bus has `commands` as a field that `registerModules` already fills, so there are two ways to connect it and the constructor one needs the registry before the bus exists.

## What Changes

- `m.use(...items)` accepts commands as well as modules, in any order and mixed in one call. A command is bound to its own handler for as long as the module is mounted. `m.handle(command, fn)` and `m.handle(bindings)` stay for an explicit handler.
- **BREAKING (unreleased API)**: `createBus` loses the `commands` option. The registry is attached to a bus that exists: `createCommands(bus, bindings?)` makes the registry, sets `bus.commands` to it and returns it; the events type comes from `bus`, so no generic is written.
- `registerModules` uses the registry that the bus has, or attaches one with `createCommands(bus)`, as before.
- A custom runner without a registry is set by assigning `bus.commands = { run }`.
- `docs/guide.md`, `docs/actions.md`, `docs/stores.md`, `examples/` and the tests move to `createCommands(bus)`; the module docs and `examples/modules.ts` show `m.use(getUser, saveUser)` for commands that carry a handler and `m.handle` for a contract.

## Capabilities

### New Capabilities
- `module-commands`: how a module brings commands: `use` for commands that carry a handler, `handle` for an explicit one, and what unmounting undoes.
- `command-registry`: how the registry of command handlers is attached to a bus, what the bus runs, and that the constructor has no `commands` option.

### Modified Capabilities

## Impact

- Code: `src/core/bus.ts` (`BusOptions` loses `commands`; the bus object keeps the mutable `commands` field), `src/actions/command.ts` (`createCommands(bus, bindings?)`), `src/actions/module.ts` (`use`, and `registerModules` calls `createCommands(bus)`).
- Size: `createBus` gets slightly smaller (one option fewer); `actions` grows by a few bytes.
- Tests: the call sites of `createBus({ commands })` (`src/actions/command.test.ts`, `register-modules.test.ts`, `src/tests/context-option.test.ts`, `src/tests/test-helpers.ts`) move to the new form; new tests for `use` with commands and for `createCommands(bus)`; type tests.
- Docs: `docs/guide.md` (steps 5 and 10), `docs/actions.md`, `docs/stores.md` if it mentions the option, `examples/modules.ts`, `AGENTS.md` (the decision on `bus.commands`), `CHANGELOG.md` (under `0.1.0`).
- No new dependency.
