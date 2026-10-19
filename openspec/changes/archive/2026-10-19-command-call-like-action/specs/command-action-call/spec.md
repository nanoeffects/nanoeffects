# command-action-call Specification

## Purpose

Calling a command or job builds the same kind of `{ type, payload }` value as `createAction`, and emitting that value on a bus runs the command and returns its result.

## ADDED Requirements

### Requirement: A command call builds an action
Calling a command made by `createCommand` (and so a job) with a payload SHALL return `{ type, payload }` whose `type` is the command's type and whose `payload` is the argument. It SHALL NOT run the command's handler.

#### Scenario: Shape matches createAction
- **WHEN** `const double = createCommand("math/double", (n: number) => n * 2)` and `double(21)` are evaluated
- **THEN** the value is `{ type: "math/double", payload: 21 }` and the handler has not run

#### Scenario: A contract call still builds an action
- **WHEN** `createCommand<string, User>("user/get")("1")` is evaluated
- **THEN** the value is `{ type: "user/get", payload: "1" }` and no error is thrown yet

### Requirement: Emitting a command call runs the command
`bus.emit(command(payload))` SHALL notify listeners of the command's type, then run the command (own handler or registry) as a task, and SHALL return the handler's result. A plain `{ type, payload }` that was not produced by calling a command SHALL only notify listeners and SHALL NOT run a command handler.

#### Scenario: Result through emit
- **WHEN** `bus.emit(double(21))` is called for a command with a doubling handler
- **THEN** listeners of `"math/double"` run, the handler runs, and `emit` returns `42`

#### Scenario: Registry wins
- **WHEN** a handler is bound for the command on the bus and `bus.emit(command(payload))` is called
- **THEN** the bound handler runs instead of the command's own

#### Scenario: Plain action is not a command run
- **WHEN** `bus.emit({ type: double.type, payload: 21 })` is called with a plain object
- **THEN** listeners of that type run and `emit` does not return the command's result as a command run (no handler of the command is invoked as a command)

### Requirement: Missing handler still fails at emit
A command call that builds an action SHALL NOT throw for a missing handler. `bus.emit(command(payload))` SHALL throw `MissingHandlerError` when neither the command nor the registry has a handler, as today for an emitted command.

#### Scenario: Error deferred to emit
- **WHEN** a contract command is called and then emitted with no registered handler
- **THEN** the call succeeds and `emit` throws `No handler for command "<type>"`
