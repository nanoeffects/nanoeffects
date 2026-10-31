## RENAMED Requirements

- FROM: `### Requirement: createJob returns the command and its actions`
- TO: `### Requirement: createJob returns the action of the job and its outcomes`

## MODIFIED Requirements

### Requirement: createJob returns the action of the job and its outcomes
`createJob(type, handler, options?)` SHALL return the action of the job (an action with a handler), with four properties added: `pending`, the action creator for its start, `success`, the action creator for its success, `fail`, the action creator for its failure, and `cancel`, the action creator for a task that is aborted after it started. It SHALL NOT return a wrapper object. Calling the job SHALL build `{ type, payload }` like any action and SHALL NOT run the handler until emit.

#### Scenario: The three parts
- **WHEN** `const loadUser = createJob("user/load", fetchUser)` is called
- **THEN** `loadUser` is an action with the type `user/load`, and `loadUser.pending`, `loadUser.success`, `loadUser.fail` and `loadUser.cancel` are action creators

#### Scenario: It is emitted as a command
- **WHEN** `bus.emit(loadUser("1"))` is called
- **THEN** the handler runs as a task and the promise resolves with its result

### Requirement: A missing handler is not an outcome
A job without a handler anywhere SHALL throw `MissingHandlerError` from `emit`, as any action that must run a handler does, and SHALL NOT route it to the fail action.

#### Scenario: No handler
- **WHEN** a job made without a handler is emitted and none is registered for it
- **THEN** `emit` throws `No handler for action "<type>"` and no action is emitted
