# Proposal: plugins work in any order

## Why

`docs/plugins.md` has a section "Follow the order" with a table of rules: `modulePlugin` last, `commandsPlugin` before `modulePlugin`, `scopePlugin` after `effectsPlugin`, `devPlugin({ app })` after `modulePlugin`, `matchPlugin` before a module that uses a predicate. A reader has to learn them, and a wrong order fails silently (a missing field on `ctx`, a lost registry). Every rule comes from one of four places where a plugin does its work at the moment it is used instead of when it is needed. Make those four lazy or safe, and the section goes away.

## What Changes

- `modulePlugin` makes its root task and mounts its initial modules lazily, on the first use of the app or of the bus: the first `bus.emit`, or the first call of `mount`, `unmount`, `isMounted`, `dispose` or the read of `commands`. Every plugin used before that is seen by the modules and by the tasks they spawn. `modulePlugin()` with no list and a later `app.mount(module)` behave as before.
- Order of listeners is kept. Between `bus.use(modulePlugin(...))` and the start, the `on`, `once` and `off` that the bus gets are held and replayed right after the initial modules are mounted, in the order they were called. A module listener therefore stays ahead of every `bus.on` made after `modulePlugin`, as when the modules were mounted inside `bus.use`. The unsubscribe function that `on` returns works before and after the replay.
- **BREAKING (observable):** the `setup` of the modules given to `modulePlugin([...])` runs on the first use of the app or the bus, not inside `bus.use(...)`; `bus.on` calls made in between take effect at that moment.
- `modulePlugin` puts the app it returns on the bus as an optional slot, `bus.app`. `devPlugin()` without the `app` option reads the slot, whichever of the two plugins came first. `devPlugin({ app })` keeps working.
- **BREAKING (observable):** a second `commandsPlugin` on a bus that already has a registry from `commandsPlugin` binds its bindings into that registry and returns it, instead of replacing it. A custom runner (`bus.commands = { run }`) is still replaced.
- `effectsPlugin` does not assign a field that the context already has, as `contextPlugin` already does. A scope field wins whichever of `scopePlugin` and `effectsPlugin` came first.
- Docs: remove "Follow the order" from `docs/plugins.md` and every "use it after / before" sentence (`plugins.md`, `scope.md`, `actions.md`, JSDoc, `AGENTS.md`); say that plugins work in any order, and that the one thing a reader chooses is where `app.mount(...)` of the lazy modules is called, which no longer matters.
- Tests: `src/tests/plugin-matrix.test.ts` loses every `explained` exception: all orders of all plugins pass every probe.

## Non-goals

- A list of plugins, an order, dependencies between plugins or a hook for them in `createBus` (AGENTS.md: not unless the owner asks). The slot is one optional field of the bus type and costs no bytes at run time.
- Mounting modules in the background (a microtask) or on a timer. The first use is the trigger.
- Making a custom `commands = { run }` merge with a registry.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bus-plugins`: initial modules are mounted on the first use of the app or the bus; the app is a slot of the bus; plugins work in any order.
- `command-registry`: a later `commandsPlugin` merges into the registry (replaces the requirement that it replaces it).
- `dev-diagnostics`: `devPlugin` finds the app from the bus when the `app` option is not given.
- `scope-context`: a scope field wins over `effectsPlugin` in either order; `scopePlugin` has no position rule.
- `effect-composition`: `effectsPlugin` does not replace a field the context already has.

## Impact

- `src/actions/module.ts` (lazy root and mount, the slot), `src/actions/command.ts` (merge), `src/effects/plugin.ts` (skip existing), `src/dev/plugin.ts` and `src/dev/types.ts` (read the slot), `src/core/bus.ts` loses `applyScope` and `fitScope` (they become `ScopeSlots` of `scopePlugin`); `app` is a plugin-owned type, `WithApp`, never a field of `Bus`.
- Docs: `docs/plugins.md`, `docs/scope.md`, `docs/actions.md`, `docs/hmr.md` if it names the order, JSDoc of the plugins, `AGENTS.md`, `CHANGELOG.md`.
- Tests: `module-plugin.test.ts`, `command-registry.test.ts`, `plugin.test.ts` of `dev` and `effects`, `plugin-matrix.test.ts`.
