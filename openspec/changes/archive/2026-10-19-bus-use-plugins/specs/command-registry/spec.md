# Spec Delta

## RENAMED Requirements
- FROM: `### Requirement: registerModules uses or attaches the registry`
- TO: `### Requirement: The module plugin uses or attaches the registry`

## MODIFIED Requirements

### Requirement: The constructor has no commands option
`createBus` SHALL NOT take a `commands` option; the commands of a bus SHALL be set only through `createCommands(bus)`, through the module plugin, or by assigning `bus.commands`.

#### Scenario: The old option is a type error
- **WHEN** `createBus({ commands: createCommands(bus) })` is written
- **THEN** it does not type-check

#### Scenario: A custom runner is assigned
- **WHEN** `bus.commands = { run }` is assigned and a command is emitted
- **THEN** `emit` calls `run` with the command, the payload and the task context

### Requirement: The module plugin uses or attaches the registry
`bus.use(modulePlugin(modules))` SHALL use the registry that the bus has, and SHALL attach one with `createCommands(bus)` when the bus has none; the registry SHALL be returned as `commands`.

#### Scenario: The bus already has a registry
- **WHEN** `createCommands(bus)` was called before `bus.use(modulePlugin([...]))`
- **THEN** the modules bind handlers in that registry and `app.commands` is that registry

#### Scenario: The bus has none
- **WHEN** `bus.use(modulePlugin([...]))` is called on a bus with no registry
- **THEN** a registry is attached, modules bind in it, and `app.commands` is it
