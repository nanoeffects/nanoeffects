# Proposal

## Why

`bus.use(modulePlugin([a, b, c]))` mounts its modules at the first use of the app or the bus: the first `bus.emit`, or a call of `mount`, `unmount`, `isMounted` or `dispose`, or a read of `commands`. An app that does none of these at start never mounts them. In a React app the first emit is often a click, so a domain that loads data when it is mounted, such as `rooms` in the chat example, does nothing until the user acts. The way out today is `modulePlugin([])` and an explicit `app.mount(...)`, which makes the list of the plugin useless for the common case and is a trap for anyone who writes the natural code.

## What Changes

- When the initial list is not empty, `modulePlugin` also schedules the start at the end of the current synchronous block, with `queueMicrotask`. The modules are then mounted without any use of the app or the bus.
- The start stays idempotent, and an earlier use still starts it at once, as today. A microtask and not an immediate start, because every `bus.use(...)` of the same synchronous block must run before the modules mount, so that the plugins used after `modulePlugin` still reach them. That is the rule that `plugin-matrix.test.ts` checks.
- `modulePlugin()` and `modulePlugin([])` change nothing: nothing is scheduled and the listeners held between `bus.use` and the first use are held as before. An app that mounts by hand keeps its behavior.
- `dispose()` before the microtask still starts the app without the initial modules, and the scheduled start then does nothing.
- An error in the `setup` of an initial module during the scheduled start has no caller to throw to. It is reported like the error of a listener (see the helper `report`), the modules of the list are rolled back as a call of `mount` with several modules does, and the app stays started. An error at a first use still throws from that use, as today.
- Docs: `docs/actions.md` and `docs/plugins.md` say when the initial modules mount and what a plugin used after an `await` can miss. `AGENTS.md` records the new rule. `CHANGELOG.md` under `Unreleased` (`### Changed`).
- The chat example: `app.ts` passes the four modules to `modulePlugin` and no longer calls `app.mount`.

**Who can be affected.** Code that relied on the initial modules not running before a first use: a test that checks `setup` has not run right after `bus.use(modulePlugin([...]))`, or an app that used the first `emit` as the start signal and then waited. Both see the modules mounted one microtask earlier. To get the old behavior: `modulePlugin([])` and `app.mount(...)` at the moment you want.

Out of scope: an eager mount inside `bus.use`, a new `app.start()` method, and any change to the order or the held listeners.

## Capabilities

### New Capabilities

### Modified Capabilities
- `bus-plugins`: the moment at which the modules given to `modulePlugin` are mounted, and what happens to an error of their setup at that moment.

## Impact

- `src/actions/module.ts` (`modulePlugin`, `start`); tests in `module-start.test.ts`, `module.test.ts`, `src/tests/plugin-matrix.test.ts`, `src/dev/plugin.test.ts` where they assume a lazy start.
- `docs/actions.md`, `docs/plugins.md`, `AGENTS.md`, `CHANGELOG.md`, `examples/chat/src/app.ts` and, if it names the mount order, `docs/chat-example.md`.
- The size of the `actions` entry grows by a few bytes; the limit in `package.json` is raised only by the measured amount.
- This change is built on `mount-many-modules`, which changes the same function: apply it after that one.
