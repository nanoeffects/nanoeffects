# Design

## Context

`modulePlugin` (`src/actions/module.ts`) builds an inner `mounts(parent)` with single-module `mount`, `unmount` and `isMounted`, and the app object forwards to it after `start()`. `mount` already returns the function that undoes it and a module whose `setup` throws is unmounted before the error is thrown (there is a test for it). A module of the same name is replaced by unmounting the old one first. `devPlugin` (`src/dev/plugin.ts`) replaces `app.mount` and `app.unmount` with wrappers that take a single `{ name }` and log, and puts the originals back on `disconnect`. `ModuleHost` is the type of `app` that `devPlugin` sees. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One call to start or stop a group of domains, with a defined order and no half-mounted state.
- No change for code that passes one module.
- `devPlugin` keeps reporting per module.

**Non-Goals:**
- Changing the lazy start of `modulePlugin([...])`: the plugin-order guarantees of `plugin-matrix.test.ts` rest on it.
- An array for `isMounted` or `use` (`use` already takes several items).

## Decisions

- **The array is expanded in one place, a small helper, and used by both the app and `devPlugin`.** `mountEach(mount, unmount)` takes the single-module functions and returns the pair `{ mount, unmount }` that accept any number of modules as separate arguments. The app builds its public `mount` and `unmount` with it from the inner ones; `devPlugin` builds its wrappers with it from its reporting single-module versions. So the order and the rollback exist once, and `devPlugin` logs each module because every module goes through its single-module function. Alternatives: repeat the loop in both places (two copies of the rollback rule), or let the app call `app.mount` per element (an outer wrapper would then see the array and an inner one single modules, so `devPlugin` would log some calls twice or none).
- **Separate arguments, not an array.** `m.use(...items)` already takes modules as separate arguments, so `app.mount(a, b, c)` reads the same, one module is the call with one argument, and the types are plain rest parameters, with no union of one and a list and no `Array.isArray`. A reader who has an array spreads it. `modulePlugin([...])` keeps its array: it is a list of the app, not a call.
- **Mount order and undo order.** Left to right to mount, reverse to undo, as the usual rule for undoing a stack: what started last stops first, so a module that listens to another is gone before the module it listens to. `app.unmount(a, b)` uses the same reverse order, so the arguments that were mounted and the function returned by `mount` agree.
- **Already mounted modules are skipped, and not undone by the returned function.** A single `mount` of a mounted module returns its existing unmount function; for several modules the returned function undoes only the modules that this call mounted, otherwise `stop()` of one call could stop a module that another part of the app started.
- **All or nothing.** The helper tracks the unmount functions of the modules mounted by this call; on an error it calls them in reverse order and rethrows. The failing module is already undone by the existing code.
- **Types.** `mount(...modules: Module<E>[]): UnsubscribeCallback` and `unmount(...modules: Module<E>[]): void`. `ModuleHost` takes the same shapes with `{ readonly name: string }`, so `devPlugin` accepts them.
- **The example.** `examples/chat/src/app.ts` becomes `app.mount(messagesModule, searchModule, incomingModule, roomsModule)` with the comment that rooms goes last. `domains-ts` uses `modulePlugin([...])` and its first use starts the app, so it is left alone.
- **Size.** The helper is a dozen lines; it is bundled into `actions` and, as a small separate chunk, shared by `dev`. Both entries are measured and their limits raised only by the measured amount.

## Risks / Trade-offs

- [A reader expects several modules to unmount in the order they were mounted] → the docs say "last mounted stops first" in one sentence, with a comment in the example.
- [`dev` now imports from `actions`] → it already imports the `ModuleHost` type from there; the helper is a value import, so `src/tests/architecture.test.ts` is run to confirm the layers still hold. If it does not, the helper moves to `src/utils`.
- [The helper changes the identity of `app.mount`] → `devPlugin` restores the function it replaced, and the matrix test for `devPlugin` with `modulePlugin` in both orders still passes.
