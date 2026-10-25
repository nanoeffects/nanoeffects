# command-registry Specification

## Purpose
Say how the registry of command handlers is connected to a bus: it is attached to an existing bus, and the constructor of the bus has no option for it.

## Requirements

### Requirement: The registry is attached to a bus
`commandsPlugin(bindings?)` SHALL return a plugin, a function of a bus; `bus.use(commandsPlugin(bindings?))` SHALL create a registry of command handlers, set it as the commands of `bus`, and return it, with the events type taken from `bus`.

#### Scenario: Handlers registered after the bus exists
- **WHEN** `const commands = bus.use(commandsPlugin())` and `commands.handle(getUser, fn)` are called, and `bus.emit(getUser("1"))` follows
- **THEN** `emit` runs `fn` and returns its result

#### Scenario: Initial bindings
- **WHEN** `bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)]))` is called
- **THEN** `bus.emit(sendMail(mail))` runs `smtpSend`

### Requirement: The constructor has no commands option
`createBus` SHALL NOT take a `commands` option; the commands of a bus SHALL be set only through `bus.use(commandsPlugin())`, through the module plugin, or by assigning `bus.commands`.

#### Scenario: The old option is a type error
- **WHEN** `createBus({ commands: bus.use(commandsPlugin()) })` is written
- **THEN** it does not type-check

#### Scenario: A custom runner is assigned
- **WHEN** `bus.commands = { run }` is assigned and a command is emitted
- **THEN** `emit` calls `run` with the command, the payload and the task context

### Requirement: Without a registry a command runs itself
A bus with no commands set SHALL run a command with the handler that the command carries when that command is emitted (as `bus.emit(command(payload))` or the equivalent two-argument form), and SHALL throw `MissingHandlerError` for a command that has none.

#### Scenario: A command that carries a handler
- **WHEN** a bus has no registry and `bus.emit(double(21))` is called for a command made with a handler
- **THEN** the handler runs and its result is returned

#### Scenario: A contract without a handler
- **WHEN** a bus has no registry and a command made without a handler is emitted
- **THEN** it throws `No handler for command "<type>"`

### Requirement: The module plugin uses or attaches the registry
`bus.use(modulePlugin(modules))` SHALL use the registry that the bus has, and SHALL attach one with `commandsPlugin()` when the bus has none; the registry SHALL be returned as `commands`.

#### Scenario: The bus already has a registry
- **WHEN** `bus.use(commandsPlugin())` was called before `bus.use(modulePlugin([...]))`
- **THEN** the modules bind handlers in that registry and `app.commands` is that registry

#### Scenario: The bus has none
- **WHEN** `bus.use(modulePlugin([...]))` is called on a bus with no registry
- **THEN** a registry is attached, modules bind in it, and `app.commands` is it

### Requirement: A later commandsPlugin merges into the registry
When the bus already has a registry made by `commandsPlugin` or by `modulePlugin`, `bus.use(commandsPlugin(bindings))` SHALL bind `bindings` in that registry and return that same registry; the handlers bound earlier SHALL keep running. A `commands` that is not such a registry (a custom runner `{ run }`) SHALL be replaced as before.

#### Scenario: Two uses share one registry
- **WHEN** `bus.use(commandsPlugin())` is called twice and a handler was bound in the first
- **THEN** both calls return the same registry and `emit` runs the handler of the first

#### Scenario: After the module plugin
- **WHEN** `bus.use(modulePlugin([userModule]))` and then `bus.use(commandsPlugin([binding]))` are called
- **THEN** the handlers the module binds and `binding` both run, and `app.commands` is that registry

#### Scenario: A custom runner is replaced
- **WHEN** `bus.commands = { run }` is set and then `bus.use(commandsPlugin())` is called
- **THEN** the bus runs the new registry
