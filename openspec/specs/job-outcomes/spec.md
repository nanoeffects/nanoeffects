# job-outcomes Specification

## Purpose
Describe a job: a command that sends its outcome on as actions, and what `createJob` gives back so that the command and its actions are held together.

## Requirements

### Requirement: createJob returns the command and its actions
`createJob(type, handler, options?)` SHALL return the command of the job, with two properties added: `success`, the action creator for its success, and `fail`, the action creator for its failure. It SHALL NOT return a wrapper object.

#### Scenario: The three parts
- **WHEN** `const loadUser = createJob("user/load", fetchUser)` is called
- **THEN** `loadUser` is a command with the type `user/load`, and `loadUser.success` and `loadUser.fail` are action creators

#### Scenario: It is emitted as a command
- **WHEN** `bus.emit(loadUser, "1")` is called
- **THEN** the handler runs as a task and the promise of the command resolves with its result

### Requirement: Strings make action creators
When `success` or `fail` is a string, the job SHALL make an action creator of that type with `createAction`; the payload of the success action SHALL be the result of the handler and the payload of the fail action the error.

#### Scenario: Types given as strings
- **WHEN** `createJob("user/load", fetchUser, { success: "user/loaded", fail: "user/failed" })` is called
- **THEN** `success.type` is `user/loaded` and `fail.type` is `user/failed`, and `success(user)` is `{ type: "user/loaded", payload: user }`

#### Scenario: The made actions are typed
- **WHEN** a job is made with strings
- **THEN** the payload type of `success` is the awaited result type of the handler and the literal types of both actions are kept

### Requirement: Existing action creators are used as they are
When `success` or `fail` is an action creator, the job SHALL use it for routing and SHALL expose that same creator as the `success` or `fail` property of the command.

#### Scenario: A given creator is returned
- **WHEN** `const loaded = createAction<User>("user/loaded")` and `createJob("user/load", fetchUser, { success: loaded })` are called
- **THEN** the `success` property of the returned command is `loaded`

### Requirement: Missing options get default types
When `success` or `fail` is not given, the job SHALL make the action creator with the type `<type>/success` or `<type>/fail`.

#### Scenario: Defaults
- **WHEN** `createJob("user/load", fetchUser)` is called with no options
- **THEN** `success.type` is `user/load/success` and `fail.type` is `user/load/fail`

### Requirement: The outcome is routed on the bus
When the command of a job is emitted, the job SHALL emit `success(result)` after the handler succeeds, or `fail(error)` after it fails, through the context of the task, and SHALL NOT emit either once the task is aborted.

#### Scenario: Success
- **WHEN** `bus.emit(loadUser, "1")` is called and the handler resolves with a user
- **THEN** a listener of `loadUser.success` receives the user, and the promise of the command resolves with the user

#### Scenario: Failure is handled
- **WHEN** the handler rejects with an error
- **THEN** a listener of `loadUser.fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: An aborted task sends nothing
- **WHEN** the task is aborted before the handler settles
- **THEN** neither action is emitted

### Requirement: A missing handler is not an outcome
A job without a handler anywhere SHALL throw `MissingHandlerError` from `emit`, as any command does, and SHALL NOT route it to the fail action.

#### Scenario: No handler
- **WHEN** a job made without a handler is emitted and none is registered for it
- **THEN** `emit` throws `No handler for command "<type>"` and no action is emitted

### Requirement: Only strings and action creators are targets
`success` and `fail` SHALL be a string or an action creator; a command or a plain action object SHALL be a type error.

#### Scenario: A command as a target
- **WHEN** a command is passed as `success`
- **THEN** it does not type-check
