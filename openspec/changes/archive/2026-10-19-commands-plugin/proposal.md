# Proposal

## Why

`createCommands(bus, bindings?)` attaches a registry to a bus, which is what a plugin does, but it takes the bus as its first argument while `modulePlugin` and `devPlugin` are used as `bus.use(plugin)`. Two ways to connect something to a bus look different without a reason. One form, `bus.use(...)`, is easier to learn and to read.

## What Changes

- **BREAKING (`0.2.x`)**: `createCommands(bus, bindings?)` is replaced by `commandsPlugin(bindings?)`, which returns a plugin `(bus) => registry`; it is used as `const commands = bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)]))`. The registry it returns is as before: `handle`, `run`, set as `bus.commands`.
- `modulePlugin` uses the same function to attach its registry when the bus has none.
- A second `commandsPlugin` on the same bus still replaces the registry.
- Docs, examples, the tests and `CHANGELOG.md` move to the new form.

## Capabilities

### New Capabilities

### Modified Capabilities
- `command-registry`: the registry is attached by `bus.use(commandsPlugin(bindings?))` instead of `createCommands(bus, bindings?)`.

## Impact

- Code: `src/actions/command.ts` (`createCommands` becomes `commandsPlugin`), `src/actions/module.ts`, `src/actions/index.ts`, comments in `src/core/bus.ts`.
- Tests: `command.test.ts`, `command-registry.test.ts`, `module-plugin.test.ts`, `job.test.ts`, `src/tests/context-option.test.ts`, `types.test.ts`, `exports.test.ts`.
- Docs: `docs/actions.md`, `docs/guide.md`, `examples/guide.ts`, `README.md` if it names it, `CHANGELOG.md`, `AGENTS.md`.
- Not changed: the registry itself, `bindHandler`, how commands run, `createBus`.
