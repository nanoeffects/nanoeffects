# Design

## Context

`modulePlugin(modules)` in `src/actions/module.ts` makes nothing at `bus.use`. It holds `bus.on`, `bus.once` and `bus.off` (`hold.ts`), wraps `bus.emit` with `starting`, and starts the app on the first use: `start()` makes the root task, mounts the initial modules, and replays the held calls. Every call of the returned app goes through `start()`. This is recorded in `AGENTS.md` and rests on the plugin matrix: plugins work in any order, and none of them may do work at `bus.use` that a later plugin could miss. See proposal.md for why the lazy start is a trap.

## Goals / Non-Goals

**Goals:**
- Initial modules mount without any use of the app or the bus.
- Every plugin used in the same synchronous block as `modulePlugin` still reaches the modules.
- Nothing changes for an app that mounts its modules by hand.

**Non-Goals:**
- Mounting inside `bus.use`, which the plugin-order rule forbids.
- A new public `app.start()`. A microtask makes it unnecessary, and a new method is more API to keep.

## Decisions

- **A microtask, not a timer and not an immediate mount.** `queueMicrotask` runs after the current synchronous block, so a `bus.use(...)` written after `bus.use(modulePlugin([...]))` runs first. A timer (`setTimeout(0)`) is later than needed and is faked by the fake timers that the tests use. Vitest fakes every timer function except `queueMicrotask` and `nextTick` by default, so a test that uses fake timers still sees the start; this is checked by a test, not assumed.
- **Only a non-empty list schedules the start.** With no initial module nothing needs to start. Scheduling anyway would release the held `on`, `once` and `off` at the end of the block instead of at the first use, and would make the root task for apps that never use it; the change is not worth that for no benefit.
- **The start is the existing `start()`.** The scheduled call is `start()` guarded by `running`: if the app was used before, or disposed before, `running` is set and the call does nothing. So the start cannot run twice and cannot run after `dispose`. `dispose()` that comes first still starts the app without the initial modules.
- **A setup that throws at the scheduled start is reported, not thrown.** There is no caller to throw to, and an exception in a microtask would be an uncaught error that can end a process. The error goes to `report`, the helper that already reports the failures of user code that must not break the flow (a listener of an outcome, a logger). The modules of the list are rolled back (the call of `mount` with several modules is all or nothing, from `mount-many-modules`), and the app stays started and usable. At a first use the error still throws from that use, as today.
- **Held calls are replayed whatever happens.** Today `start()` replays the held `on`, `once` and `off` after mounting the initial modules, and a `setup` that throws leaves that replay undone, so the listeners registered after `bus.use` are lost. The replay moves into a `finally`, which fixes that for both paths. A test pins it.
- **A plugin used after an `await` can miss the modules.** If the code awaits between `bus.use(modulePlugin([...]))` and a later `bus.use(...)`, the microtask has run and the modules were mounted without that plugin's fields. This is the same limit as using a plugin after the first `emit` today, now with a clear boundary: the end of the synchronous block. It goes into `docs/plugins.md` and `docs/actions.md`, with the advice to use every plugin before the first `await`.
- **The record.** The decision in `AGENTS.md` ("`modulePlugin` makes nothing at `bus.use`: its root task and its initial modules wait for the first use of the app or the first `bus.emit`") becomes: nothing is made at `bus.use`; the initial modules mount at the first use or, with a non-empty list, at the end of the synchronous block, and that is why a microtask and not an immediate mount.
- **The chat example.** `examples/chat/src/app.ts` becomes `export const app = bus.use(modulePlugin([messagesModule, searchModule, incomingModule, roomsModule]))` with a comment that rooms goes last and the modules start at the end of the block.

## Risks / Trade-offs

- [A test or app relied on `setup` not running before the first use] → it sees the mount one microtask earlier; the proposal says how to get the old behavior (`modulePlugin([])` and `app.mount` when wanted). The tests that assume laziness are rewritten, not deleted.
- [The error of a setup at the scheduled start is only logged] → it is the same treatment as other failures with no caller; the rollback keeps the app consistent, and a first use still throws.
- [The change builds on `mount-many-modules`] → both change `start()`; this one is applied after that one, and its rollback of the initial list comes from it.
- [A module that is slow to set up delays nothing] → `setup` is synchronous and runs in the microtask; an async job it starts is in a task of the module, as before.

## Open Questions

None that change the specs.
