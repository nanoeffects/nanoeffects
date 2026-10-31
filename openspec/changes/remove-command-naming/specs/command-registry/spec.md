## RENAMED Requirements

- FROM: `### Requirement: Without a registry a command runs itself`
- TO: `### Requirement: Without a registry an action runs its own handler`

## MODIFIED Requirements

### Requirement: Without a registry an action runs its own handler
A bus with no actions set SHALL run an action that carries a handler (including one made by `createAction(type, handler)`) with that handler when it is emitted, as `bus.emit(action(payload))` or the two-argument form, and SHALL throw `MissingHandlerError` for a job that has none.

#### Scenario: A command that carries a handler
- **WHEN** a bus has no registry and `bus.emit(double(21))` is called for an action made with a handler
- **THEN** the handler runs and its result is returned

#### Scenario: A contract without a handler
- **WHEN** a bus has no registry and a job made without a handler is emitted
- **THEN** it throws `No handler for action "<type>"`
