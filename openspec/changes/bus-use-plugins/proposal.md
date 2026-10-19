# Proposal

## Why

The bus is extended in more than one way: modules are attached with `registerModules(bus, modules)`, and development diagnostics are about to be attached with a function of their own. Each such extension is a function that takes the bus and may return something, so one entry point for them, `bus.use(plugin)`, keeps the vocabulary small and lets an extension live in its own entry without the core knowing about it. It costs one line in `createBus`.

## What Changes

- `bus.use(plugin)` calls `plugin(bus)` and returns what the plugin returns. A plugin is a plain function `(bus) => result`; there is no registry of plugins, no order and no merging of what they return.
- Modules become a plugin: `bus.use(modulePlugin(modules?))` returns what `registerModules` returned (`mount`, `unmount`, `isMounted`, `dispose`, `commands`) and mounts the given modules at once, in order.
- **BREAKING (unreleased API surface of `0.1.x`)**: `registerModules` is removed in favor of `modulePlugin`. Behavior of modules (replacement by name, unmounting, `m.use`, `m.handle`) is unchanged.
- Docs, examples, tests and `AGENTS.md` move to the plugin form; the decision "no plugin system" in `AGENTS.md` becomes "a plugin is a function, `bus.use` is one line".

## Capabilities

### New Capabilities
- `bus-plugins`: `bus.use(plugin)`, what a plugin is, and the module plugin that replaces `registerModules`.

### Modified Capabilities
- `command-registry`: the places that name `registerModules` now name the module plugin.

## Impact

- Code: `src/core/bus.ts` (`use` on the bus and its type, one line plus the type), `src/actions/module.ts` (`registerModules` becomes `modulePlugin`), `src/actions/index.ts`.
- Size: `createBus` grows by a few bytes and stays within its limit.
- Tests: `src/actions/register-modules.test.ts`, `src/tests/test-helpers.ts`, `src/tests/exports.test.ts`, `src/tests/types.test.ts`, `integration/bundlers.test.ts` and the guide test move to `modulePlugin`; new tests for `use`.
- Docs: `docs/guide.md`, `docs/actions.md`, `docs/hmr.md`, `README.md`, `examples/*`, `AGENTS.md`, `CHANGELOG.md`.
- Follows: `dev-diagnostics` uses `bus.use` for its plugin.
