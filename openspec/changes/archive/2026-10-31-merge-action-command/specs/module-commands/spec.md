## MODIFIED Requirements

### Requirement: use accepts commands
`use(...items)` in the context of a module SHALL accept commands (an action made with a handler, or `createCommand`) as well as modules, and SHALL bind each to the handler it carries, for as long as the module is mounted.

#### Scenario: A command is listed without its handler
- **WHEN** a module calls `m.use(getUser, saveUser)` and both were made with a handler
- **THEN** `bus.emit(getUser, "1")` and `bus.emit(saveUser, user)` run those handlers and return their results

#### Scenario: The binding is in the registry
- **WHEN** a module has called `m.use(getUser)` and an action registry is in use
- **THEN** `app.actions` holds a handler for the type of `getUser`

### Requirement: A later handler wins
A handler registered for the type of a command after `use` bound it, by `handle` or by another module, SHALL answer instead of the bound one, and removing it SHALL bring the bound one back.

#### Scenario: A test replaces a handler
- **WHEN** a module has called `m.use(getUser)` and a test calls `app.actions.handle(getUser, fake)`
- **THEN** `emit` runs `fake`, and after the returned unbind runs it runs the handler of the command again
