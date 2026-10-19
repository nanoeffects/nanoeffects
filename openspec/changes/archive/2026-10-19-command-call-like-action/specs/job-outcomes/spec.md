# job-outcomes Specification

## MODIFIED Requirements

### Requirement: createJob returns the command and its actions
`createJob(type, handler, options?)` SHALL return the command of the job, with two properties added: `success`, the action creator for its success, and `fail`, the action creator for its failure. It SHALL NOT return a wrapper object. Calling the job SHALL build `{ type, payload }` like any command and SHALL NOT run the handler until emit.

#### Scenario: The three parts
- **WHEN** `const loadUser = createJob("user/load", fetchUser)` is called
- **THEN** `loadUser` is a command with the type `user/load`, and `loadUser.success` and `loadUser.fail` are action creators

#### Scenario: It is emitted as a command
- **WHEN** `bus.emit(loadUser("1"))` is called
- **THEN** the handler runs as a task and the promise of the command resolves with its result

### Requirement: The outcome is routed on the bus
When the command of a job is emitted, the job SHALL emit `success(result)` after the handler succeeds, or `fail(error)` after it fails, through the context of the task, and SHALL NOT emit either once the task is aborted.

#### Scenario: Success
- **WHEN** `bus.emit(loadUser("1"))` is called and the handler resolves with a user
- **THEN** a listener of `loadUser.success` receives the user, and the promise of the command resolves with the user

#### Scenario: Failure is handled
- **WHEN** the handler rejects with an error
- **THEN** a listener of `loadUser.fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: An aborted task sends nothing
- **WHEN** the task is aborted before the handler settles
- **THEN** neither action is emitted
