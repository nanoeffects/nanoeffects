# Design

## Context

`registerModules(bus, modules)` makes the root task of the app from the bus (`bus.trace`, the fields of `bus.context`), attaches or finds the registry, mounts the modules and returns the api. `createBus` returns `{ on, off, emit, context?, commands?, trace? }`. Earlier a `bus.use` and a `modulePlugin` existed and were removed as a plugin system that was too much (registry of plugins, `composeBus`, api merging); what is wanted now is only the entry point. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- One entry point for extensions that costs one line in the core.
- Modules attached as a plugin, with the behavior they have.

**Non-Goals:**
- A list of plugins on the bus, ordering, dependencies between plugins, or merging what plugins return onto the bus (the older `composeBus`).
- Letting a plugin change `createBus` options after the fact.
- Changing how modules, commands or the registry work.

## Decisions

**1. `use` is one line and a type.** `use: (plugin) => plugin(bus)` in the object that `createBus` returns, typed `use<R>(plugin: (bus: Bus<E>) => R): R`. The plugin gets the same `bus` object, so it can read `bus.context`, `bus.trace`, set `bus.commands` and wrap `bus.on` as `registerModules` already does. Alternative: a plugin option in `createBus`. Rejected: it needs the plugins before the bus and cannot return an api.

**2. `modulePlugin(modules?)` is `registerModules` turned inside out.** `modulePlugin(modules)` returns `(bus) => ModuleApi`, and the body is the old body of `registerModules` with `bus` from the argument. The function `registerModules` is deleted: two ways to attach modules would split the docs and the tests. Alternative: keep `registerModules` as `bus.use(modulePlugin(modules))`. Rejected: the package is small and `0.1.x`, one form is simpler.

**3. Typing.** `E` of `modulePlugin<E>` comes from the modules given; for `bus.use(modulePlugin())` the events type is `EventMap` unless written (`modulePlugin<Events>()`), as `registerModules` behaved. `ModuleApi<E>` is unchanged.

**4. The rule in `AGENTS.md`.** "No plugin system" is replaced by "a plugin is a function of the bus; `bus.use` is one line; do not add a registry of plugins, ordering or merging of results without the owner asking".

## Risks / Trade-offs

- [`createBus` grows by the `use` line] → a few bytes; measured by `pnpm size`.
- [Breaking: `registerModules` is removed] → every call site in the repository moves in this change; `0.1.x` is young.
- [A plugin can do anything to the bus] → true of `registerModules` already; the docs say a plugin is a function you write or import.

## Migration Plan

For users: `registerModules(bus, modules)` becomes `bus.use(modulePlugin(modules))`. In the repository: tests, docs, examples, the integration test and `AGENTS.md` move in this change.
