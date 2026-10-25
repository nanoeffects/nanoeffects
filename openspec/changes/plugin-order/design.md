# Design: plugins work in any order

See `proposal.md`. The requirements are in `specs/`.

## Context

Every order rule of `docs/plugins.md` has one cause:

| Rule | Cause |
| ---- | ----- |
| `modulePlugin` last | it makes the root task (`createTask` with `bus`) and mounts the initial modules inside `bus.use`. A module task is forked from the root, and the root copied the fields of the plugins used before it; `addContext` of a later plugin never reaches the root, `m` or the tasks `m.spawn` runs |
| a predicate in `m.on(fn)` needs `matchPlugin` earlier | `setup` runs inside `bus.use`, before `matchPlugin` has wrapped `bus.on` |
| `commandsPlugin` before `modulePlugin` | `commandsPlugin` sets `bus.commands = registry`; a second one replaces the registry the modules bound in |
| `scopePlugin` after `effectsPlugin` | `effectsPlugin` assigns its effects in `addContext` over the fields a scope put there |
| `devPlugin({ app })` after `modulePlugin` | it needs the value `modulePlugin` returns |

## Decisions

### Mount on the first use

`modulePlugin` keeps `modules` and builds nothing in `bus.use` except the registry and the hold below. A `start()` function does what the body did: it creates the root task, makes `mounts(root.ctx)` and mounts the initial modules in order. It runs once, at the first of: `bus.emit` (the plugin wraps the `emit` it finds, like `scopePlugin`), or a call of `mount`, `unmount`, `isMounted`, `dispose` of the app, or the read of `commands`. `started` is set before the modules are mounted, so a `setup` that calls `m.emit` or `app.mount` does not start it again. `app.mount(module)` before the start starts first, so the initial modules come first. `dispose()` before the start only marks the app as disposed: the initial modules never run.

Only `bus.emit` needs the wrapper: a handler of a module can run only after an emit, and the module is a listener only once mounted.

### The order of listeners: hold and replay

Listeners run in the order they were registered, and a module registers in `setup`. If `setup` runs later, its listeners would come after every `bus.on` made in between, and the order would change. To keep it, `modulePlugin` wraps `on`, `once` and `off` of the bus for the time before the start:

- a call is pushed to a queue as `[method, args]` and a stand-in is returned: for `on` and `once` an unsubscribe function that removes the entry from the queue, or, after the replay, calls the real unsubscribe function;
- `off(event, fn)` removes the matching queued entry, or after the replay calls the real `off`;
- `start()` mounts the initial modules, restores the methods it wrapped (if its wrapper is still on top; else the wrapper passes through, as `devPlugin` does), then replays the queue through the methods it found at `bus.use`, in order.

Wrappers that other plugins put on top later (`matchPlugin`, `devPlugin`) call down into the hold, so a predicate becomes a `"*"` call and is held like any other; `devPlugin` counts a call when it reaches the original method: at the call if it was used after `modulePlugin` (it wraps the hold), at the replay if it was used before (the hold wraps it), so the warning about piled-up listeners can come at the start of the modules. A plugin used before `modulePlugin` is below the hold and sees the replayed calls.

The listeners registered before `bus.use(modulePlugin(...))` are registered at once and stay first, as before. What changes: `bus.on` after the plugin is live at the first use, not at once. `onUnhandled` and a trace of an emit see no difference, because nothing is delivered before the first emit.

Alternatives: `bus.start()` for the owner to pin the order (one more line to forget; rejected, the hold needs none); reordering the store after `setup` (needs an insert-at API in `src/core`); giving the already existing module contexts the fields of later plugins (`addContext` runs only for new contexts, and `m.spawn` reads fields synchronously at mount, so it cannot work).

### `bus.app` is a slot

`Bus` does not know the slot: the bus knows nothing about its plugins. `modulePlugin` takes `Bus<E> & ScopeSlots & WithApp`, where `WithApp` (`app?: ModuleHost`) lives in `src/actions/module.ts`, and `devPlugin` takes `Bus<E> & WithApp` and imports the type from there. `ModuleHost` is `mount`, `unmount` and `isMounted` in method syntax (bivariant, so `ModuleApi<E>` is assignable). The same goes for `applyScope` and `fitScope`, which moved from `Bus` to `ScopeSlots` in `src/scope/types.ts`; `scopePlugin` takes and returns `Bus<E> & ScopeSlots`, so its types come with the plugin. Core keeps only what it calls itself: `ctx`, `trace`, `commands`, `addContext`.

`devPlugin()` without `app`:

1. if `bus.app` is set when `devPlugin` is used, it watches that app at once;
2. else it defines an accessor `app` on the bus with a setter that, when `modulePlugin` assigns the app, starts watching it, and keeps the value readable by a getter;
3. `disconnect` restores `mount`/`unmount` if it watched, and replaces the accessor with the plain value (or removes it if nothing was assigned).

The accessor is the only trick, and it lives in `src/dev`, which production replaces with a no-op. If it proves fragile (a frozen bus, another plugin that also defines `app`), the fallback is a `WeakMap` in `src/actions` read at the first `bus.on`; decide in apply if step 1 of the tasks fails.

`devPlugin({ app })` keeps working and wins over the slot.

### `commandsPlugin` merges

`commandsPlugin(bindings)` looks at `bus.commands`: if it is a registry made here (it has `handle`), the new bindings go in through that registry's `handle` and the same registry is returned. Else it makes a registry as before. `modulePlugin` already reuses the registry the bus has; it keeps doing so, and if `commandsPlugin` comes later it merges into the registry of the app.

Breaking for code that used a second call to start from an empty registry. The migration is in the spec: unbind through the function `handle` returned, or set `bus.commands = { run }`.

### `effectsPlugin` does not overwrite

`if (!(key in ctx))` around the assignment, as `contextPlugin` has. The effects are put in `addContext`, which runs for tasks made by the bus, whose fields start from `bus.ctx`. A `ctx.run` child is made by `createTask` with the same bus, so it is filled by `addContext` again and gets effects bound to itself, not copied from the parent (the scenario in the spec pins this). A forked module task has no `addContext` (the fork gets a small bus object) and takes the parent's fields, as before.

`scopePlugin` needs no change: it already assigns its fields in its own `addContext`, so when it comes after `effectsPlugin` its fields replace the effects, and when it comes before, `effectsPlugin` leaves them.

### Core size

Only a type changes in `src/core/bus.ts`. Measure `createBus` (rolldown, gzip, as in AGENTS.md) before and after; the expectation is the same bytes. If a byte moves, stop and settle it here.

## Risks

- The hold wraps three methods of the bus for a while. A bug there would lose or double a subscription, so the tests cover: unsubscribe before and after the replay, `once` fired by the first emit that starts the app, `off` before the replay, a predicate (`matchPlugin`) in either order, a listener added from inside a `setup`, and `devPlugin` counts.
- A test or user code that checks `isMounted(initial)` right after `bus.use` gets `true` anyway: `isMounted` starts the app. Code that reads the effects of `setup` (a global set in `setup`) right after `bus.use` without touching the app or the bus sees them late. Covered in the CHANGELOG.
- The wrapper of `bus.emit` adds one call to the first emit and, after the start, one more call for every emit unless the wrapper unwraps itself. It restores `bus.emit` to what it found if no other plugin has wrapped it since; otherwise it stays and passes through. Check with `scripts/bench-scope.mjs`-style numbers that a plain emit does not slow down in a measurable way.
- The matrix test is the guard: with the exceptions removed, any order that fails is a bug of this change.

## Docs

Remove "Follow the order" and every "use after/before" sentence; add to the page of plugins one paragraph: plugins work in any order, initial modules start on the first use and their listeners stay ahead of the ones registered after the plugin. Keep the data dependency visible in an example: `const app = bus.use(modulePlugin(...))` is a value, and `devPlugin()` no longer needs it.
