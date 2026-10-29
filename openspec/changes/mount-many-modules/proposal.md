# Proposal

## Why

`bus.use(modulePlugin([a, b, c]))` mounts its modules the first time the app or the bus is used (the first `emit`, or a call of `mount`). An app that does not emit at start, such as a React app that only reacts to clicks, never mounts them, and the way out is `modulePlugin([])` followed by one `app.mount(...)` per module. The same goes for stopping a group of modules. The chat example has four such lines and a comment about their order.

## What Changes

- `app.mount` and `app.unmount` accept any number of modules as separate arguments, as `m.use(...items)` does. `app.mount(a, b, c)` mounts them left to right and returns one function that unmounts what the call mounted; `app.unmount(a, b)` unmounts several. A list in an array is spread: `app.mount(...modules)`.
- A single module behaves exactly as today: it is the call with one argument. This only adds arguments to existing calls.
- A call with several modules is all or nothing: if the `setup` of one module throws, the modules of that call that were already mounted are unmounted again, in reverse order, and the error is thrown.
- `devPlugin` reports every module of a call with several, as it reports a single one.
- Docs: a line and an example in `docs/actions.md`, `CHANGELOG.md` under `Unreleased`. The chat example uses `app.mount(...)` in one call instead of four lines.

Out of scope: several modules for `isMounted`, a change to `modulePlugin([...])` and its lazy start, and any change to how a module of the same name replaces another.

## Capabilities

### New Capabilities
- `module-mounting`: mounting and unmounting one module or a list of modules through the app.

### Modified Capabilities
- `dev-diagnostics`: `devPlugin` reports each module of a list.

## Impact

- `src/actions/module.ts` (`ModuleApi`, `ModuleHost`, the app object) and a small helper next to it; `src/dev/plugin.ts` (the wrappers around `mount` and `unmount`). Tests next to both, and `src/tests/types.test.ts`.
- `docs/actions.md`, `CHANGELOG.md`, `examples/chat/src/app.ts` and the sentence about the order in `docs/chat-example.md`.
- Size: the `actions` entry grows by a few dozen bytes and `dev` by a few; both are measured against their limits in `package.json`. `createBus` is not touched.
