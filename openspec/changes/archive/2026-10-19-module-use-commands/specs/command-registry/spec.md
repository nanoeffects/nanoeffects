# Spec Delta

## Purpose
Say how the registry of command handlers is connected to a bus: it is attached to an existing bus, and the constructor of the bus has no option for it.

## ADDED Requirements

### Requirement: The registry is attached to a bus
`createCommands(bus, bindings?)` SHALL create a registry of command handlers, set it as the commands of `bus`, and return it, with the events type taken from `bus`.

#### Scenario: Handlers registered after the bus exists
- **WHEN** `const commands = createCommands(bus)` and `commands.handle(getUser, fn)` are called, and `bus.emit(getUser, "1")` follows
- **THEN** `emit` runs `fn` and returns its result

#### Scenario: Initial bindings
- **WHEN** `createCommands(bus, [bindHandler(sendMail, smtpSend)])` is called
- **THEN** `bus.emit(sendMail, mail)` runs `smtpSend`

### Requirement: The constructor has no commands option
`createBus` SHALL NOT take a `commands` option; the commands of a bus SHALL be set only through `createCommands(bus)`, through `registerModules`, or by assigning `bus.commands`.

#### Scenario: The old option is a type error
- **WHEN** `createBus({ commands: createCommands(bus) })` is written
- **THEN** it does not type-check

#### Scenario: A custom runner is assigned
- **WHEN** `bus.commands = { run }` is assigned and a command is emitted
- **THEN** `emit` calls `run` with the command, the payload and the task context

### Requirement: Without a registry a command runs itself
A bus with no commands set SHALL run a command with the handler that the command carries, and SHALL throw `MissingHandlerError` for a command that has none.

#### Scenario: A command that carries a handler
- **WHEN** a bus has no registry and `bus.emit(double, 21)` is called for a command made with a handler
- **THEN** the handler runs and its result is returned

#### Scenario: A contract without a handler
- **WHEN** a bus has no registry and a command made without a handler is emitted
- **THEN** it throws `No handler for command "<type>"`

### Requirement: A later registry replaces the earlier one
A second `createCommands(bus)` on the same bus SHALL replace the registry of that bus; the handlers of the earlier registry SHALL no longer run through that bus.

#### Scenario: Replacement
- **WHEN** `createCommands(bus)` is called twice and a handler was bound in the first registry
- **THEN** `emit` ignores the handler of the first registry

### Requirement: registerModules uses or attaches the registry
`registerModules(bus, modules)` SHALL use the registry that the bus has, and SHALL attach one with `createCommands(bus)` when the bus has none; the registry SHALL be returned as `commands`.

#### Scenario: The bus already has a registry
- **WHEN** `createCommands(bus)` was called before `registerModules(bus, [...])`
- **THEN** the modules bind handlers in that registry and `app.commands` is that registry

#### Scenario: The bus has none
- **WHEN** `registerModules(bus, [...])` is called on a bus with no registry
- **THEN** a registry is attached, modules bind in it, and `app.commands` is it
