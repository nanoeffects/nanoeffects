# job-outcomes Specification

## Purpose
Describe a job: a command that sends its outcome on as actions, and what `createJob` gives back so that the command and its actions are held together.

## Requirements

### Requirement: createJob returns the command and its actions
`createJob(type, handler, options?)` SHALL return the command of the job, with four properties added: `pending`, the action creator for its start, `success`, the action creator for its success, `fail`, the action creator for its failure, and `cancel`, the action creator for a task that is aborted after it started. It SHALL NOT return a wrapper object. Calling the job SHALL build `{ type, payload }` like any command and SHALL NOT run the handler until emit.

#### Scenario: The three parts
- **WHEN** `const loadUser = createJob("user/load", fetchUser)` is called
- **THEN** `loadUser` is a command with the type `user/load`, and `loadUser.pending`, `loadUser.success`, `loadUser.fail` and `loadUser.cancel` are action creators

#### Scenario: It is emitted as a command
- **WHEN** `bus.emit(loadUser("1"))` is called
- **THEN** the handler runs as a task and the promise of the command resolves with its result

### Requirement: Strings make action creators
When `pending`, `success`, `fail` or `cancel` is a string, the job SHALL make an action creator of that type with `createAction`; the payload of the pending action SHALL be the payload of the call, the payload of the success action the result of the handler, the payload of the fail action the error and the payload of the cancel action the abort reason of the task.

#### Scenario: Types given as strings
- **WHEN** `createJob("user/load", fetchUser, { pending: "user/loading", success: "user/loaded", fail: "user/failed", cancel: "user/cancelled" })` is called
- **THEN** the four creators have those types, and `success(user)` is `{ type: "user/loaded", payload: user }`

#### Scenario: The made actions are typed
- **WHEN** a job is made with strings
- **THEN** the payload type of `pending` is the payload type of the handler, of `success` the awaited result type, of `fail` and `cancel` `unknown`, and the literal types of all four are kept

### Requirement: Existing action creators are used as they are
When `pending`, `success`, `fail` or `cancel` is an action creator, the job SHALL use it for routing and SHALL expose that same creator under the same property of the command.

#### Scenario: A given creator is returned
- **WHEN** `const loading = createAction<string>("user/loading")` and `createJob("user/load", fetchUser, { pending: loading })` are called
- **THEN** the `pending` property of the returned command is `loading`

### Requirement: Missing options get default types
When an outcome is not given, the job SHALL make the action creator with the type `<type>/pending`, `<type>/success`, `<type>/fail` or `<type>/cancel`.

#### Scenario: Defaults
- **WHEN** `createJob("user/load", fetchUser)` is called with no options
- **THEN** the types are `user/load/pending`, `user/load/success`, `user/load/fail` and `user/load/cancel`

### Requirement: The outcome is routed on the bus
When the command of a job is emitted, the job SHALL emit `pending(payload)` through the context of the task when the handler really starts, then `success(result)` after the handler succeeds, or `fail(error)` after it fails. Without a policy around the handler it starts when it is called. With a policy it starts when the policy lets it (see `policy-lifecycle`), and a call that never starts sends no outcome. Exactly one of `success`, `fail`, `cancel` SHALL follow a `pending` of the same call, and none SHALL be sent without a `pending`. `success` and `fail` SHALL NOT be emitted once the task of the job is aborted. `cancel(reason)` SHALL be emitted at the moment the task is aborted or a policy cancels the call, after `pending` and not after the handler settles. A job used without a listener of an outcome SHALL run as before.

#### Scenario: Success
- **WHEN** `bus.emit(loadUser("1"))` is called and the handler resolves with a user
- **THEN** a listener of `loadUser.pending` receives `"1"` first, then a listener of `loadUser.success` receives the user, and the promise of the command resolves with the user

#### Scenario: Failure is handled
- **WHEN** the handler rejects with an error
- **THEN** a listener of `loadUser.pending` ran before, a listener of `loadUser.fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: An aborted task sends nothing
- **WHEN** the task is aborted after `pending` and before the handler settles, whether the handler later rejects with the abort reason, resolves, or never settles
- **THEN** `loadUser.cancel` is emitted once, at the moment of the abort, with the abort reason, neither `success` nor `fail` is emitted, and the promise of the command resolves with `undefined`

#### Scenario: A flag follows the outcomes
- **WHEN** a store sets `loading` on `pending` and clears it on `success`, `fail` and `cancel`, and the task of the call is aborted with `ctx.abort()` or because its parent is aborted
- **THEN** the flag is `true` while the handler runs and `false` right after the abort, whether the handler rejects with the abort reason or ignores the signal

#### Scenario: A flag under latest
- **WHEN** a store sets `loading` on `pending` and clears it on `success`, `fail` and `cancel`, a job handler is wrapped in `latest(fn)`, and the job is called again while the first run goes
- **THEN** the first run sends `cancel` before the second sends `pending`, so the flag is `true` while the second run goes and `false` when it ends

#### Scenario: A dropped call sends nothing
- **WHEN** a job handler is wrapped in `leading(fn)` and called again while the first run goes
- **THEN** the second call sends nothing and the flag of the first run is not cleared by it

#### Scenario: A throwing listener of cancel
- **WHEN** a listener of `cancel` throws
- **THEN** the promise of the command still resolves with `undefined`

#### Scenario: A listener of pending throws
- **WHEN** a listener of `pending` throws
- **THEN** the handler is not called, `fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: Outcomes without a listener
- **WHEN** nobody listens to `pending` or `cancel`
- **THEN** nothing breaks and the call runs as before; like `success` and `fail`, they are events, so `onUnhandled` of the bus (a dev diagnostic) is called for each one nobody listens to

### Requirement: A missing handler is not an outcome
A job without a handler anywhere SHALL throw `MissingHandlerError` from `emit`, as any command does, and SHALL NOT route it to the fail action.

#### Scenario: No handler
- **WHEN** a job made without a handler is emitted and none is registered for it
- **THEN** `emit` throws `No handler for command "<type>"` and no action is emitted

### Requirement: Only strings and action creators are targets
`pending`, `success`, `fail` and `cancel` SHALL be a string or an action creator; a plain action object SHALL be a type error.

#### Scenario: A plain object as a target
- **WHEN** a plain `{ type }` object is passed as `pending` or `cancel`
- **THEN** it does not type-check

### Requirement: A job without a handler sends no outcome
`pending` SHALL be emitted only when the job has a handler to call. A job with no handler SHALL throw `MissingHandlerError` from `emit` and send none of the four outcomes.

#### Scenario: No handler
- **WHEN** a job made without a handler is emitted and no handler is bound
- **THEN** `emit` throws `MissingHandlerError` and no outcome is sent

#### Scenario: A bound handler
- **WHEN** a handler is bound with `commands.handle`
- **THEN** `pending` is sent before it is called, or when its policy lets it start, and a closing outcome follows, as for the own handler
