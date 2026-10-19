# Design

## Context

`createCommands(bus, bindings)` in `src/actions/command.ts` builds the registry (`bound`, `handle`, `run`), sets `bus.commands = registry` and returns it. `modulePlugin` calls it when `bus.commands` is empty. `bus.use(plugin)` is `plugin(bus)`, and `modulePlugin(modules)` and `devPlugin(options)` already have the shape `(options) => (bus) => result`.

## Goals / Non-Goals

**Goals:**
- One way to connect to a bus: `bus.use(...)`.
- The same registry, with the same behavior.

**Non-Goals:**
- Changing `handle`, `run`, the priority of bound handlers or the unbinding.
- A second, old form kept next to the new one.

## Decisions

**1. Rename and reshape, no alias.** `commandsPlugin = <E>(bindings = []) => (bus: Bus<E>) => { ...same body... }`. The old `createCommands` is removed, not kept: two forms are what this change removes, and the package is young. Alternative: keep `createCommands(bus, bindings)` and add the plugin. Rejected: two ways to do one thing.

**2. `modulePlugin` calls the plugin.** `const registry = given ?? commandsPlugin<E>()(bus)`; calling it directly is fine since a plugin is a function of the bus, no need to go through `bus.use`. The `Registry` type there becomes `ReturnType<ReturnType<typeof commandsPlugin<E>>>`, or a named exported type `CommandRegistry<E>` if that reads better; the second is chosen when it is shorter to read.

**3. Type inference.** `bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)]))` has to take `E` from the bus through the expected return type, as `modulePlugin` does; a type test checks that handlers bound with `bindHandler` keep their payload types. If inference fails for bindings, the fallback is a bindings type that does not mention `E`.

**4. The error text of `modulePlugin`** about a `commands` that is not a registry from `createCommands()` now names `commandsPlugin()`.

## Risks / Trade-offs

- [BREAKING for `createCommands(bus, ...)`] → named in the `CHANGELOG.md`; the next version is chosen at release.
- [Inference of `E` from `bus.use`] → a type test; fallback in decision 3.

## Migration Plan

`const commands = createCommands(bus, bindings)` becomes `const commands = bus.use(commandsPlugin(bindings))`.
