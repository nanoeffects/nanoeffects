# Design

## Context

`ModuleContext` has `handle(target, fn?)`, which calls `commands.handle` of the registry and hangs the unbind on the abort of the module task, and `use(...modules)`, which mounts sub-modules through `children.mount`. A command is a function with a `type` that runs its own handler when called; a registry entry for the same type wins over it, and without an entry the command runs itself. The registry is made by `createCommands(bindings?)` and connected either with `createBus({ commands })` or, since `bus.commands` became a mutable field, by `registerModules`, which attaches its own when the bus has none. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- `use` brings commands and sub-modules in one call, with one return value that undoes the call.
- One way to connect a registry to a bus, without a constructor option and without needing the registry before the bus.
- No second implementation of binding: `use` reuses `handle`.

**Non-Goals:**
- A strict mode where a command answers only while a module that lists it is mounted. A command that carries a handler answers whether or not it is bound, so `use` does not change what `emit` does for it; it declares who brings it and keeps the registry in step with the mounted modules.
- Calling a command by its type string with `emit("type", payload)`; a string stays an event.
- Changing how the registry resolves handlers (the last bound wins, then the command's own).

## Decisions

**1. `use` binds a command to itself.** For a command `c`, `use(c)` is `handle(c, c)`: the registry gets an entry whose function is the command, which calls its own handler. Alternative: a separate "register own handler" path in the registry. Rejected: it would duplicate `bind`, the stack of handlers and the unbind.

**2. The kinds are told apart by shape.** `typeof item === "function"` is a command (commands are functions with a `type`), anything else is a module (`{ name, setup }`). Alternative: separate methods. Rejected: the request is one verb. Alternative: a brand on modules. Rejected: the shapes are already disjoint.

**3. One return value for the whole call.** `use` collects the undo function of each item and returns one function that calls them all, which is what `use(...modules)` returns today.

**4. The registry is attached to the bus: `createCommands(bus, bindings?)`.** It makes the registry, assigns `bus.commands = registry`, and returns it. The bus is made first, so the events type is inferred from it (`createCommands(bus)`), and the registry no longer has to exist before the bus. `registerModules` calls it when the bus has no registry. Alternative: keep the constructor option next to the new function. Rejected: two ways to do one thing, and the option costs core code. Alternative: `bus.commands = createCommands<Events>()` by hand. Rejected: the generic has to be written and the step is easy to forget. Alternative: make `createCommands(bus)` idempotent (return the registry the bus has). Rejected: a second call with other bindings would silently ignore them; replacing is simple and documented.

**5. `BusOptions.commands` is removed; `bus.commands` stays.** The core keeps the `Commands` interface (`run`) and the mutable field that `emit` reads each time, so a custom runner is still `bus.commands = { run }` and a bus without any runs the command itself. `createCommands` has no `bus.commands` of its own to guard: the type of its first argument is `{ commands?: Commands | undefined }` plus the bus types it needs.

**6. Types.** `use(...items: Array<Module<E> | Command<never, unknown>>)`. An action creator also fits the call signature of `Command`; binding one is harmless and is not guarded at run time. `createCommands<E>(bus: Bus<E>, bindings?: readonly Binding<E>[])`.

## Risks / Trade-offs

- [A reader may expect `use(command)` to switch the command off after `unmount`] → the docs say it plainly: a command with a handler keeps answering; `use` only brings and tracks it. The strict variant is left for a later change.
- [A command without a handler passed to `use` fails only when it runs] → same as today for a contract; the docs point to `handle`.
- [A second `createCommands(bus)` silently drops the first registry] → documented, covered by a test; `registerModules` never makes a second one.
- [Breaking change of the constructor] → the package is not released; all call sites in tests, docs and examples move in this change.

## Migration Plan

None for users: the package is not released. In the repository every `createBus({ commands })` becomes `createBus(...)` followed by `createCommands(bus)`; `use` with modules only and `handle` do not change.
