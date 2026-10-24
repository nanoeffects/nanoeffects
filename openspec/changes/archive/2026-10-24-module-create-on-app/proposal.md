# Proposal

## Why

A module lives in its own file, away from the bus. `createModule<AppEvents>("user", …)` needs the event map of the bus spelled out, and for a bus with `WithContext` and plugins that map is `EventsOf<typeof bus>`, exported and imported by every module file. Without it, `ctx.store` and `ctx.race` are unknown inside the module (see `docs/typescript.md`).

The app object that `modulePlugin` returns already belongs to the bus and carries its event map in its type. Creating the module from it removes the type that every module file has to import.

## What Changes

- `app.createModule(name, setup)` on the object that `bus.use(modulePlugin(...))` returns. It is `createModule` from `nanoeffects/actions` with the event map of the bus already fixed, so handlers of the module see the context fields of the bus (`WithContext`, `effectsPlugin`) without a type argument.
- It returns a plain `Module`, as `createModule` does. It is not mounted and it keeps no reference to the bus: `app.mount(module)` mounts it, and the same module can be mounted on another app.
- `createModule` from `nanoeffects/actions` stays and is unchanged.
- Docs: `docs/typescript.md` and `docs/actions.md` use `app.createModule`; the example `examples/typescript-context` follows. CHANGELOG entry.

## Capabilities

### New Capabilities
- `app-module-factory`: creating a module from the app of a bus, typed with the event map of that bus.

### Modified Capabilities

## Non-goals

- A `createCommand` bound to the bus (too much API: a second copy of every creator). Commands keep `createCommand<Payload, Result>(type)` and are handled in a module, where the payload, the result and `ctx` are inferred.
- Mounting on creation. Creating and mounting stay two steps, so a module file has no side effect.
- A `bus.createModule` on the bus itself: the bus stays small, and `modulePlugin` is what brings modules.

## Impact

- `src/actions/module.ts`: one field in `ModuleApi` and one line in `modulePlugin`; no change to `src/core`, so `createBus` does not grow.
- Tests next to `module-plugin.test.ts`; a type test in `src/tests/types.test.ts`.
- `docs/typescript.md`, `docs/actions.md`, `examples/typescript-context`, `CHANGELOG.md`.
