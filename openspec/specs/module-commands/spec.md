# module-commands Specification

## Purpose
Let a module bring the commands it owns by listing them with `use`, next to its sub-modules, and say what mounting and unmounting do to those commands.

## Requirements

### Requirement: use accepts commands
`use(...items)` in the context of a module SHALL accept commands as well as modules, and SHALL bind each command to the handler the command carries, for as long as the module is mounted.

#### Scenario: A command is listed without its handler
- **WHEN** a module calls `m.use(getUser, saveUser)` and both commands were made with a handler
- **THEN** `bus.emit(getUser, "1")` and `bus.emit(saveUser, user)` run those handlers and return their results

#### Scenario: The binding is in the registry
- **WHEN** a module has called `m.use(getUser)` and a command registry is in use
- **THEN** `app.commands` holds a handler for the type of `getUser`

### Requirement: use accepts a mix of commands and modules
`use` SHALL accept commands and modules in one call, in any order, and SHALL handle each by its kind: a function with a `type` is a command, an object with `name` and `setup` is a module.

#### Scenario: A call with both kinds
- **WHEN** a module calls `m.use(getUser, subModule, saveUser)`
- **THEN** both commands are bound and `subModule` is mounted as a sub-module of this module

#### Scenario: Sub-modules are mounted as before
- **WHEN** a module calls `m.use(subModule)` with a module only
- **THEN** the behavior is as before this change: the sub-module is mounted and is unmounted with this module

### Requirement: Unmounting undoes the binding
Unmounting a module, disposing the app, or replacing the module by name SHALL remove the bindings that `use` made for its commands. The function that `use` returns SHALL remove just the bindings and sub-modules of that call.

#### Scenario: Unmount removes the binding
- **WHEN** a module has called `m.use(getUser)` and an override was registered later for the same type, and the module is unmounted
- **THEN** the binding of the module is gone, and the override still answers

#### Scenario: The returned function undoes only that call
- **WHEN** `const undo = m.use(getUser)` and a later `m.use(saveUser)` were called, and `undo()` runs
- **THEN** the binding of `getUser` is removed and the binding of `saveUser` stays

### Requirement: A later handler wins
A handler registered for the type of a command after `use` bound it, by `handle` or by another module, SHALL answer instead of the bound one, and removing it SHALL bring the bound one back.

#### Scenario: A test replaces a handler
- **WHEN** a module has called `m.use(getUser)` and a test calls `app.commands.handle(getUser, fake)`
- **THEN** `emit` runs `fake`, and after the returned unbind runs it runs the handler of the command again

### Requirement: handle is unchanged
`handle(command, fn)` and `handle(bindings)` SHALL keep binding an explicit handler for the life of the module, as before this change.

#### Scenario: A contract gets its handler in the module
- **WHEN** a module calls `m.handle(getUser, fn)` for a command made without a handler
- **THEN** `emit(getUser)` runs `fn`
