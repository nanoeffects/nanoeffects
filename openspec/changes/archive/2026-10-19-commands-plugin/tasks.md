# Tasks

## 1. The plugin

- [x] 1.1 `commandsPlugin(bindings?)` in `src/actions/command.ts` returns `(bus) => registry` with the body of `createCommands`; `createCommands` is removed; `index.ts` exports the new name. Verify: unit tests through `bus.use(commandsPlugin(...))` for handling after the bus exists, initial bindings, replacement by a second plugin, and one registry per bus.
- [x] 1.2 `modulePlugin` attaches its registry with `commandsPlugin()(bus)` and its error text names `commandsPlugin()`. Verify: `module-plugin.test.ts` passes, including the case with a registry attached before.
- [x] 1.3 Types: the events of the registry come from the bus; `bindHandler` bindings keep their payload types; `createBus({ commands: ... })` is an error. Verify: tests in `src/tests/types.test.ts` and `pnpm tsgo` clean.

## 2. Callers and docs

- [x] 2.1 Move `command.test.ts`, `command-registry.test.ts`, `job.test.ts`, `context-option.test.ts` and `exports.test.ts` to the new form. Verify: `pnpm vitest run` passes.
- [x] 2.2 `docs/actions.md`, `docs/guide.md`, `examples/guide.ts`, `README.md`, comments in `src/core/bus.ts`, `CHANGELOG.md`, `AGENTS.md` show `bus.use(commandsPlugin(...))`. Verify: `pnpm tsgo` type-checks the examples and `src/tests/guide.test.ts` passes.

## 3. Verification

- [x] 3.1 `pnpm verify` passes, `createBus` stays within its size limit. Verify: the command exits 0.
