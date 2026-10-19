# command-registry Specification

## MODIFIED Requirements

### Requirement: The registry is attached to a bus
`commandsPlugin(bindings?)` SHALL return a plugin, a function of a bus; `bus.use(commandsPlugin(bindings?))` SHALL create a registry of command handlers, set it as the commands of `bus`, and return it, with the events type taken from `bus`.

#### Scenario: Handlers registered after the bus exists
- **WHEN** `const commands = bus.use(commandsPlugin())` and `commands.handle(getUser, fn)` are called, and `bus.emit(getUser("1"))` follows
- **THEN** `emit` runs `fn` and returns its result

#### Scenario: Initial bindings
- **WHEN** `bus.use(commandsPlugin([bindHandler(sendMail, smtpSend)]))` is called
- **THEN** `bus.emit(sendMail(mail))` runs `smtpSend`

### Requirement: Without a registry a command runs itself
A bus with no commands set SHALL run a command with the handler that the command carries when that command is emitted (as `bus.emit(command(payload))` or the equivalent two-argument form), and SHALL throw `MissingHandlerError` for a command that has none.

#### Scenario: A command that carries a handler
- **WHEN** a bus has no registry and `bus.emit(double(21))` is called for a command made with a handler
- **THEN** the handler runs and its result is returned

#### Scenario: A contract without a handler
- **WHEN** a bus has no registry and a command made without a handler is emitted
- **THEN** it throws `No handler for command "<type>"`
